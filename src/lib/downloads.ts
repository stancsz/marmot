import { File, Directory, Paths, DownloadTask, type DownloadPauseState, type DownloadProgress, type DownloadTaskOptions } from 'expo-file-system'
import * as LegacyFileSystem from 'expo-file-system/legacy'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { CATALOG, getModel } from '../models/catalog'
import { DownloadState, ModelId } from '../types'

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

export function modelPath(modelId: ModelId): string {
  return new File(MODELS_DIR, `${modelId}.gguf`).uri
}

function getModelFile(modelId: ModelId): File {
  return new File(MODELS_DIR, `${modelId}.gguf`)
}

function getPartFile(modelId: ModelId): File {
  return new File(MODELS_DIR, `${modelId}.gguf.part`)
}

type Listener = (states: Record<ModelId, DownloadState>) => void

/**
 * Singleton download manager. Downloads go to <model>.gguf.part and are moved
 * to <model>.gguf on completion, so a .gguf file on disk is always complete.
 * Resume snapshots are persisted so an interrupted download can continue
 * after an app restart.
 */
class DownloadManager {
  private states: Record<ModelId, DownloadState> = {}
  private tasks: Record<ModelId, DownloadTask> = {}
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
      const info = getModelFile(spec.id)
      if (info.exists) {
        this.states[spec.id] = {
          modelId: spec.id,
          status: 'done',
          progress: 1,
          receivedBytes: spec.sizeBytes,
          totalBytes: spec.sizeBytes,
        }
        continue
      }
      const part = getPartFile(spec.id)
      if (part.exists) {
        const snapshot = await this.loadResumeSnapshot(spec.id)
        if (!snapshot) {
          // A .part without resume data can't actually be resumed (the app
          // was killed mid-download) — showing it as "paused" would lie:
          // Resume would silently restart from zero. Reset honestly instead.
          try { part.delete() } catch {}
          continue
        }
        const received = part.size ?? 0
        this.states[spec.id] = {
          modelId: spec.id,
          status: 'paused',
          progress: received / spec.sizeBytes,
          receivedBytes: received,
          totalBytes: spec.sizeBytes,
        }
      }
    }
    this.emit()
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    fn(this.getStates())
    return () => this.listeners.delete(fn)
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
      totalBytes: getModel(modelId)?.sizeBytes ?? 0,
    }
    this.states[modelId] = { ...prev, ...patch }
    this.emit()
  }

  async start(modelId: ModelId): Promise<void> {
    const spec = getModel(modelId)
    if (!spec || this.isDownloaded(modelId) || this.tasks[modelId]) return

    const onProgress = (p: DownloadProgress) => {
      const total = p.totalBytes > 0 ? p.totalBytes : spec.sizeBytes
      this.update(modelId, {
        status: 'downloading',
        receivedBytes: p.bytesWritten,
        totalBytes: total,
        progress: p.bytesWritten / total,
      })
    }

    let task: DownloadTask
    const saved = await this.loadResumeSnapshot(modelId)
    if (saved) {
      task = DownloadTask.fromSavable(saved, { ...DOWNLOAD_OPTIONS, onProgress })
    } else {
      task = new DownloadTask(spec.url, getPartFile(modelId), { ...DOWNLOAD_OPTIONS, onProgress })
    }
    this.tasks[modelId] = task
    this.update(modelId, { status: 'downloading', error: undefined })

    try {
      const result = saved ? await task.resumeAsync() : await task.downloadAsync()
      if (!result) return // paused or cancelled

      const part = getPartFile(modelId)
      const dest = getModelFile(modelId)

      if (dest.exists) {
        dest.delete()
      }
      part.moveSync(dest)

      await this.clearResumeSnapshot(modelId)
      this.update(modelId, {
        status: 'done',
        progress: 1,
        receivedBytes: spec.sizeBytes,
        totalBytes: spec.sizeBytes,
      })
    } catch (e: any) {
      if (this.cancelling.has(modelId)) {
        // the rejection came from our own cancel — not a real error
        this.cancelling.delete(modelId)
        this.update(modelId, { status: 'idle', progress: 0, receivedBytes: 0 })
      } else {
        this.update(modelId, { status: 'error', error: e?.message ?? 'Download failed' })
      }
    } finally {
      delete this.tasks[modelId]
    }
  }

  async pause(modelId: ModelId): Promise<void> {
    const task = this.tasks[modelId]
    // a pause tap can race completion — never flip a finished file to paused
    if (!task || this.states[modelId]?.status !== 'downloading') return
    try {
      await task.pauseAsync()
      await this.saveResumeSnapshot(modelId, task)
      if (this.states[modelId]?.status === 'downloading') {
        this.update(modelId, { status: 'paused' })
      }
    } catch {
      // pausing can race with completion; ignore
    }
    delete this.tasks[modelId]
  }

  async cancel(modelId: ModelId): Promise<void> {
    const task = this.tasks[modelId]
    if (task) {
      this.cancelling.add(modelId)
      try { task.cancel() } catch {}
      delete this.tasks[modelId]
    }
    try { getPartFile(modelId).delete() } catch {}
    await this.clearResumeSnapshot(modelId)
    this.update(modelId, { status: 'idle', progress: 0, receivedBytes: 0 })
  }

  async remove(modelId: ModelId): Promise<void> {
    // deleting a model that is still downloading must stop the task first,
    // or it will finish later and resurrect an error state
    if (this.tasks[modelId]) await this.cancel(modelId)
    try { getModelFile(modelId).delete() } catch {}
    try { getPartFile(modelId).delete() } catch {}
    await this.clearResumeSnapshot(modelId)
    this.update(modelId, { status: 'idle', progress: 0, receivedBytes: 0 })
  }

  async freeDiskBytes(): Promise<number> {
    return LegacyFileSystem.getFreeDiskStorageAsync()
  }

  private async saveResumeSnapshot(modelId: ModelId, task: DownloadTask) {
    const all = await this.loadAllSnapshots()
    all[modelId] = task.savable()
    await AsyncStorage.setItem(RESUME_KEY, JSON.stringify(all))
  }

  private async loadResumeSnapshot(modelId: ModelId): Promise<DownloadPauseState | null> {
    const all = await this.loadAllSnapshots()
    return all[modelId] ?? null
  }

  private async clearResumeSnapshot(modelId: ModelId) {
    const all = await this.loadAllSnapshots()
    if (modelId in all) {
      delete all[modelId]
      await AsyncStorage.setItem(RESUME_KEY, JSON.stringify(all))
    }
  }

  private async loadAllSnapshots(): Promise<Record<string, DownloadPauseState>> {
    try {
      const raw = await AsyncStorage.getItem(RESUME_KEY)
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  }
}

export const downloads = new DownloadManager()
