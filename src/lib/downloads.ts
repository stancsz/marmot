import { AppState, type AppStateStatus } from 'react-native'
import {
  Directory,
  DownloadTask,
  File,
  Paths,
  type DownloadPauseState,
  type DownloadProgress,
  type DownloadTaskOptions,
} from 'expo-file-system'
import * as LegacyFileSystem from 'expo-file-system/legacy'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { CATALOG, getModel, totalDownloadBytes } from '../models/catalog'
import { DownloadState, ModelId, ModelSpec } from '../types'

const MODELS_DIR = new Directory(Paths.document, 'models')
const RESUME_KEY = 'marmot.downloads.resume.v1'

/**
 * BACKGROUND session keeps multi-GB downloads running when the app is
 * backgrounded on iOS (it is the platform default, pinned here so it's a
 * guarantee, not an accident). Android continues while the process lives.
 */
const DOWNLOAD_OPTIONS: DownloadTaskOptions = {
  sessionType: 'background',
}

type AssetKind = 'model' | 'projector'

interface DownloadAsset {
  kind: AssetKind
  url: string
  sizeBytes: number
  file: File
  part: File
}

interface ResumeEntry {
  asset: AssetKind
  state: DownloadPauseState
}

export function modelPath(modelId: ModelId): string {
  return new File(MODELS_DIR, `${modelId}.gguf`).uri
}

export function projectorPath(modelId: ModelId): string {
  return new File(MODELS_DIR, `${modelId}.mmproj.gguf`).uri
}

function getModelFile(modelId: ModelId): File {
  return new File(MODELS_DIR, `${modelId}.gguf`)
}

function getPartFile(modelId: ModelId): File {
  return new File(MODELS_DIR, `${modelId}.gguf.part`)
}

function getProjectorFile(modelId: ModelId): File {
  return new File(MODELS_DIR, `${modelId}.mmproj.gguf`)
}

function getProjectorPartFile(modelId: ModelId): File {
  return new File(MODELS_DIR, `${modelId}.mmproj.gguf.part`)
}

/** Return the base model and optional projector as one ordered download plan. */
export function getModelAssets(spec: ModelSpec): DownloadAsset[] {
  const assets: DownloadAsset[] = [
    {
      kind: 'model',
      url: spec.url,
      sizeBytes: spec.sizeBytes,
      file: getModelFile(spec.id),
      part: getPartFile(spec.id),
    },
  ]
  if (spec.projector) {
    assets.push({
      kind: 'projector',
      url: spec.projector.url,
      sizeBytes: spec.projector.sizeBytes,
      file: getProjectorFile(spec.id),
      part: getProjectorPartFile(spec.id),
    })
  }
  return assets
}

type Listener = (states: Record<ModelId, DownloadState>) => void

/**
 * Singleton download manager. Each asset goes to its own `.part` file and is
 * moved into place only after completion. A paired model is `done` only when
 * both its weights and projector are complete.
 */
class DownloadManager {
  private states: Record<ModelId, DownloadState> = {}
  private tasks: Record<ModelId, DownloadTask> = {}
  private activeAssets: Record<ModelId, DownloadAsset> = {}
  private listeners = new Set<Listener>()
  private initialized = false
  private cancelling = new Set<ModelId>()

  async init(): Promise<void> {
    if (this.initialized) return
    this.initialized = true
    try {
      MODELS_DIR.create({ intermediates: true })
    } catch {
      // ignore
    }

    for (const spec of CATALOG) {
      const assets = getModelAssets(spec)
      if (assets.every((asset) => asset.file.exists)) {
        this.states[spec.id] = this.doneState(spec)
        continue
      }

      let resumable = false
      for (const asset of assets) {
        if (!asset.part.exists) continue
        const snapshot = await this.loadResumeSnapshot(spec.id)
        if (!snapshot || snapshot.asset !== asset.kind) {
          // A .part without matching resume data cannot actually be resumed.
          try { asset.part.delete() } catch {}
          continue
        }
        resumable = true
      }
      if (resumable) this.states[spec.id] = this.pausedState(spec)
    }
    this.emit()
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    fn(this.getStates())
    return () => this.listeners.delete(fn)
  }

  /** Pause active downloads on background and resume them on foreground. */
  attachAppStateHandler(): () => void {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        for (const id of Object.keys(this.tasks) as ModelId[]) {
          this.pause(id).catch(() => {})
        }
      } else if (next === 'active') {
        for (const id of Object.keys(this.states) as ModelId[]) {
          if (this.states[id]?.status === 'paused' && !this.tasks[id]) {
            this.start(id).catch(() => {})
          }
        }
      }
    })
    return () => sub.remove()
  }

  getStates(): Record<ModelId, DownloadState> {
    return { ...this.states }
  }

  isDownloaded(modelId: ModelId): boolean {
    return this.states[modelId]?.status === 'done'
  }

  downloadedModelIds(): ModelId[] {
    return CATALOG.filter((m) => this.isDownloaded(m.id)).map((m) => m.id)
  }

  private emit() {
    const snapshot = this.getStates()
    this.listeners.forEach((fn) => fn(snapshot))
  }

  private update(modelId: ModelId, patch: Partial<DownloadState>) {
    const prev: DownloadState = this.states[modelId] ?? {
      modelId,
      status: 'idle',
      progress: 0,
      receivedBytes: 0,
      totalBytes: getModel(modelId) ? totalDownloadBytes(getModel(modelId)!) : 0,
    }
    this.states[modelId] = { ...prev, ...patch }
    this.emit()
  }

  private doneState(spec: ModelSpec): DownloadState {
    const totalBytes = totalDownloadBytes(spec)
    return {
      modelId: spec.id,
      status: 'done',
      progress: 1,
      receivedBytes: totalBytes,
      totalBytes,
    }
  }

  private pausedState(spec: ModelSpec): DownloadState {
    const totalBytes = totalDownloadBytes(spec)
    return {
      modelId: spec.id,
      status: 'paused',
      progress: this.receivedBytes(getModelAssets(spec)) / totalBytes,
      receivedBytes: this.receivedBytes(getModelAssets(spec)),
      totalBytes,
    }
  }

  private receivedBytes(assets: DownloadAsset[]): number {
    return assets.reduce((sum, asset) => {
      if (asset.file.exists) return sum + asset.sizeBytes
      return sum + Math.min(asset.part.size ?? 0, asset.sizeBytes)
    }, 0)
  }

  async start(modelId: ModelId): Promise<void> {
    const spec = getModel(modelId)
    if (!spec || this.isDownloaded(modelId) || this.tasks[modelId]) return

    const assets = getModelAssets(spec)
    let saved = await this.loadResumeSnapshot(modelId)
    let asset = (saved
      ? assets.find((candidate) => candidate.kind === saved?.asset && !candidate.file.exists)
      : undefined) ?? assets.find((candidate) => !candidate.file.exists)
    if (!asset) {
      this.states[modelId] = this.doneState(spec)
      this.emit()
      return
    }

    try {
      while (asset) {
        const completedBefore = assets
          .filter((candidate) => candidate.kind !== asset?.kind && candidate.file.exists)
          .reduce((sum, candidate) => sum + candidate.sizeBytes, 0)
        const onProgress = (p: DownloadProgress) => {
          const total = p.totalBytes > 0 ? p.totalBytes : asset!.sizeBytes
          const received = completedBefore + Math.min(p.bytesWritten, total)
          const overallTotal = totalDownloadBytes(spec)
          this.update(modelId, {
            status: 'downloading',
            receivedBytes: received,
            totalBytes: overallTotal,
            progress: received / overallTotal,
          })
        }

        const task = saved && saved.asset === asset.kind
          ? DownloadTask.fromSavable(saved.state, { ...DOWNLOAD_OPTIONS, onProgress })
          : new DownloadTask(asset.url, asset.part, { ...DOWNLOAD_OPTIONS, onProgress })
        this.tasks[modelId] = task
        this.activeAssets[modelId] = asset
        this.update(modelId, {
          status: 'downloading',
          error: undefined,
          totalBytes: totalDownloadBytes(spec),
          receivedBytes: this.receivedBytes(assets),
          progress: this.receivedBytes(assets) / totalDownloadBytes(spec),
        })

        const result = saved && saved.asset === asset.kind
          ? await task.resumeAsync()
          : await task.downloadAsync()
        if (!result) return // paused or cancelled

        if (asset.file.exists) asset.file.delete()
        asset.part.moveSync(asset.file)
        await this.clearResumeSnapshot(modelId)
        saved = null
        asset = assets.find((candidate) => !candidate.file.exists)
      }

      this.states[modelId] = this.doneState(spec)
      this.emit()
    } catch (e: any) {
      if (this.cancelling.has(modelId)) {
        this.cancelling.delete(modelId)
        this.update(modelId, { status: 'idle', progress: 0, receivedBytes: 0 })
      } else {
        this.update(modelId, {
          status: 'error',
          error: e?.message ?? 'Download failed',
          receivedBytes: this.receivedBytes(assets),
          totalBytes: totalDownloadBytes(spec),
          progress: this.receivedBytes(assets) / totalDownloadBytes(spec),
        })
      }
    } finally {
      delete this.tasks[modelId]
      delete this.activeAssets[modelId]
    }
  }

  async pause(modelId: ModelId): Promise<void> {
    const task = this.tasks[modelId]
    const asset = this.activeAssets[modelId]
    if (!task || !asset || this.states[modelId]?.status !== 'downloading') return
    try {
      await task.pauseAsync()
      await this.saveResumeSnapshot(modelId, asset.kind, task)
      if (this.states[modelId]?.status === 'downloading') {
        const spec = getModel(modelId)
        this.update(modelId, spec ? this.pausedState(spec) : { status: 'paused' })
      }
    } catch {
      // pausing can race with completion; ignore
    }
    delete this.tasks[modelId]
    delete this.activeAssets[modelId]
  }

  async cancel(modelId: ModelId): Promise<void> {
    const task = this.tasks[modelId]
    if (task) {
      this.cancelling.add(modelId)
      try { task.cancel() } catch {}
      delete this.tasks[modelId]
      delete this.activeAssets[modelId]
    }
    const spec = getModel(modelId)
    if (spec?.projector) {
      for (const asset of getModelAssets(spec)) {
        try { asset.file.delete() } catch {}
        try { asset.part.delete() } catch {}
      }
    } else {
      try { getPartFile(modelId).delete() } catch {}
    }
    await this.clearResumeSnapshot(modelId)
    this.update(modelId, { status: 'idle', progress: 0, receivedBytes: 0 })
  }

  async remove(modelId: ModelId): Promise<void> {
    if (this.tasks[modelId]) await this.cancel(modelId)
    const spec = getModel(modelId)
    if (spec) {
      for (const asset of getModelAssets(spec)) {
        try { asset.file.delete() } catch {}
        try { asset.part.delete() } catch {}
      }
    } else {
      try { getModelFile(modelId).delete() } catch {}
      try { getPartFile(modelId).delete() } catch {}
    }
    await this.clearResumeSnapshot(modelId)
    this.update(modelId, { status: 'idle', progress: 0, receivedBytes: 0 })
  }

  async freeDiskBytes(): Promise<number> {
    return LegacyFileSystem.getFreeDiskStorageAsync()
  }

  private async saveResumeSnapshot(modelId: ModelId, asset: AssetKind, task: DownloadTask) {
    const all = await this.loadAllSnapshots()
    all[modelId] = { asset, state: task.savable() }
    await AsyncStorage.setItem(RESUME_KEY, JSON.stringify(all))
  }

  private async loadResumeSnapshot(modelId: ModelId): Promise<ResumeEntry | null> {
    const all = await this.loadAllSnapshots()
    const saved = all[modelId]
    if (!saved) return null
    // Accept the old single-file shape so an in-flight text-model download is
    // not discarded after upgrading the app.
    if ('asset' in saved && 'state' in saved) return saved as ResumeEntry
    return { asset: 'model', state: saved as DownloadPauseState }
  }

  private async clearResumeSnapshot(modelId: ModelId) {
    const all = await this.loadAllSnapshots()
    if (modelId in all) {
      delete all[modelId]
      await AsyncStorage.setItem(RESUME_KEY, JSON.stringify(all))
    }
  }

  private async loadAllSnapshots(): Promise<Record<string, ResumeEntry | DownloadPauseState>> {
    try {
      const raw = await AsyncStorage.getItem(RESUME_KEY)
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  }
}

export const downloads = new DownloadManager()
