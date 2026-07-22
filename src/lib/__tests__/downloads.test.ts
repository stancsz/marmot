/**
 * DownloadManager state-machine tests with mocked expo-file-system (new
 * File/Directory/DownloadTask API) and AsyncStorage — covers crash/cancel/
 * race handling, resume across a module reload, and AppState backgrounding.
 */

// Shared mutable state so the test can drive in-flight tasks.
const fsState: any = { files: new Map<string, number>(), resumables: [] as any[] }

// --- mock the NEW expo-file-system surface used by downloads.ts -----------
// A minimal File/Directory that mirrors the bits of the real API we touch:
// .exists, .size, .uri, .delete(), .moveSync(), .create(). The real
// constructors accept variadic string/File/Directory parts and join them;
// we do the same with a small URL-join that strips trailing slashes.
function joinUris(parts: (string | MockFile | MockDirectory)[]): string {
  const segs: string[] = []
  for (const p of parts) {
    const s = typeof p === 'string' ? p : p.uri
    for (const piece of s.split('/')) {
      if (piece === '' || piece === '.') continue
      segs.push(piece)
    }
  }
  // first segment is the scheme://host, preserve the leading slashes
  if (segs.length === 0) return ''
  const [first, ...rest] = segs
  let out = first
  if (rest.length === 0) return out.endsWith('/') ? out : out + '/'
  // `first` looks like "file:" — reattach the authority slash pair
  if (first.endsWith(':')) out += '//' + rest.shift()
  else out += '/' + rest.shift()
  for (const r of rest) out += '/' + r
  return out
}

class MockFile {
  uri: string
  constructor(...parts: (string | MockFile | MockDirectory)[]) {
    this.uri = joinUris(parts)
  }
  get exists(): boolean {
    return fsState.files.has(this.uri)
  }
  get size(): number | undefined {
    return fsState.files.get(this.uri)
  }
  delete() {
    fsState.files.delete(this.uri)
  }
  moveSync(dest: MockFile) {
    const size = fsState.files.get(this.uri)
    fsState.files.delete(this.uri)
    if (size != null) fsState.files.set(dest.uri, size)
  }
}

class MockDirectory {
  uri: string
  constructor(...parts: (string | MockFile | MockDirectory)[]) {
    this.uri = joinUris(parts)
  }
  create() {
    // no-op in tests
  }
}

class MockDownloadTask {
  url: string
  destination: MockFile | MockDirectory
  options: any
  _resumeData?: string
  _state: 'idle' | 'active' | 'paused' | 'completed' | 'cancelled' | 'error' = 'idle'
  _resolve?: (v: any) => void
  _reject?: (e: any) => void

  constructor(url: string, destination: MockFile | MockDirectory, options?: any) {
    this.url = url
    this.destination = destination
    this.options = options
    this._resumeData = undefined
    fsState.resumables.push(this)
  }

  downloadAsync(): Promise<MockFile | null> {
    this._state = 'active'
    return new Promise((res, rej) => {
      this._resolve = (file: MockFile | null) => {
        if (file) this._state = 'completed'
        res(file)
      }
      this._reject = rej
    })
  }

  resumeAsync(): Promise<MockFile | null> {
    this._state = 'active'
    return this.downloadAsync()
  }

  pause(): void {
    this._state = 'paused'
    // matches the real SDK: pausing causes the in-flight downloadAsync()
    // to resolve with null once resume data is available
    this._resumeData = 'rd'
    this._resolve?.(null)
  }

  async pauseAsync(): Promise<void> {
    this.pause()
  }

  cancel(): void {
    if (['completed', 'cancelled', 'error'].includes(this._state)) return
    this._state = 'cancelled'
    this._reject?.(new Error('cancelled'))
  }

  savable(): any {
    return {
      url: this.url,
      fileUri: (this.destination as MockFile).uri,
      isDirectory: this.destination instanceof MockDirectory,
      headers: this.options?.headers,
      resumeData: this._resumeData ?? 'rd',
    }
  }

  static fromSavable(state: any, options?: any): MockDownloadTask {
    if (!state.resumeData) throw new Error('Cannot restore task: no resumeData')
    const dest = state.isDirectory ? new MockDirectory(state.fileUri) : new MockFile(state.fileUri)
    const task = new MockDownloadTask(state.url, dest, options)
    task._resumeData = state.resumeData
    task._state = 'paused'
    return task
  }

  // --- test helpers so tests can drive the in-flight promise ------------
  finish(status = 200, size = 999) {
    if (status !== 200 && status !== 206) {
      this._reject?.(new Error(`Server responded with ${status}`))
      return
    }
    const uri = (this.destination as MockFile).uri
    fsState.files.set(uri, size)
    this._resolve?.(new MockFile(uri))
  }
  fail(message = 'network error') {
    this._reject?.(new Error(message))
  }
}

jest.mock('expo-file-system', () => ({
  File: MockFile,
  Directory: MockDirectory,
  Paths: { document: 'file:///doc/', cache: 'file:///cache/', temp: 'file:///temp/' },
  DownloadTask: MockDownloadTask,
}))

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///doc/',
  FileSystemSessionType: { BACKGROUND: 0, FOREGROUND: 1 },
  getFreeDiskStorageAsync: async () => 1e12,
}))

jest.mock('@react-native-async-storage/async-storage', () => {
  const map = new Map<string, string>()
  return {
    __esModule: true,
    __map: map,
    default: {
      getItem: async (k: string) => map.get(k) ?? null,
      setItem: async (k: string, v: string) => {
        map.set(k, v)
      },
    },
  }
})

// Minimal AppState mock. Tests reach into __listeners to fire transitions.
type AppStateListener = (state: string) => void
const appStateListeners = new Set<AppStateListener>()
jest.mock('react-native', () => ({
  AppState: {
    get currentState(): string {
      return (globalThis as any).__appState ?? 'active'
    },
    addEventListener: (_: string, fn: AppStateListener) => {
      appStateListeners.add(fn)
      return { remove: () => appStateListeners.delete(fn) }
    },
  },
}))

const flush = () => new Promise((r) => setTimeout(r, 0))

function fresh() {
  jest.resetModules()
  fsState.files.clear()
  fsState.resumables.length = 0
  appStateListeners.clear()
  ;(globalThis as any).__appState = 'active'
  /* eslint-disable @typescript-eslint/no-var-requires */
  const storage = require('@react-native-async-storage/async-storage')
  storage.__map.clear()
  const { downloads, modelPath, projectorPath } = require('../downloads')
  const { CATALOG } = require('../../models/catalog')
  // Keep the state-machine fixture on a single-file text model. The catalog
  // also contains a paired vision model, whose second projector download is
  // exercised by the multimodal milestone tests rather than this legacy-path
  // fixture.
  const id = CATALOG.find((model: any) => model.id === 'qwen3.5-0.8b')?.id as string
  const visionId = CATALOG.find((model: any) => model.id === 'smolvlm-256m')?.id as string
  return { fs: { __state: fsState }, storage, downloads, modelPath, projectorPath, id, visionId, appStateListeners }
}

describe('DownloadManager', () => {
  it('init marks an existing .gguf as done', async () => {
    const { fs, downloads, modelPath, id } = fresh()
    fs.__state.files.set(modelPath(id), 12345)
    await downloads.init()
    expect(downloads.isDownloaded(id)).toBe(true)
    expect(downloads.getStates()[id].progress).toBe(1)
  })

  it('init deletes an orphaned .part that has no resume snapshot', async () => {
    const { fs, downloads, modelPath, id } = fresh()
    const part = `${modelPath(id)}.part`
    fs.__state.files.set(part, 5000)
    await downloads.init()
    expect(fs.__state.files.has(part)).toBe(false)
    expect(downloads.getStates()[id]).toBeUndefined() // honest idle, not fake "paused"
  })

  it('a completed download is moved atomically and marked done', async () => {
    const { fs, downloads, modelPath, id } = fresh()
    await downloads.init()
    const done = downloads.start(id)
    await flush()
    fs.__state.resumables[0].finish(200)
    await done
    expect(downloads.isDownloaded(id)).toBe(true)
    expect(fs.__state.files.has(modelPath(id))).toBe(true)
    expect(fs.__state.files.has(`${modelPath(id)}.part`)).toBe(false)
  })

  it('downloads and finalizes a paired model and projector as one state', async () => {
    const { fs, downloads, modelPath, projectorPath, visionId } = fresh()
    await downloads.init()
    const done = downloads.start(visionId)
    await flush()

    expect(fs.__state.resumables[0].destination.uri).toBe(`${modelPath(visionId)}.part`)
    fs.__state.resumables[0].finish(200, 175_054_528)
    await flush()

    const projectorTask = fs.__state.resumables[fs.__state.resumables.length - 1]
    expect(projectorTask.destination.uri).toBe(`${projectorPath(visionId)}.part`)
    projectorTask.finish(200, 190_031_616)
    await done

    expect(downloads.isDownloaded(visionId)).toBe(true)
    expect(fs.__state.files.has(modelPath(visionId))).toBe(true)
    expect(fs.__state.files.has(projectorPath(visionId))).toBe(true)
    expect(fs.__state.files.has(`${modelPath(visionId)}.part`)).toBe(false)
    expect(fs.__state.files.has(`${projectorPath(visionId)}.part`)).toBe(false)

    await downloads.remove(visionId)
    expect(fs.__state.files.has(modelPath(visionId))).toBe(false)
    expect(fs.__state.files.has(projectorPath(visionId))).toBe(false)
  })

  it('a network failure surfaces as an error state', async () => {
    const { fs, downloads, id } = fresh()
    await downloads.init()
    const done = downloads.start(id)
    await flush()
    fs.__state.resumables[0].fail('connection lost')
    await done
    expect(downloads.getStates()[id].status).toBe('error')
    expect(downloads.getStates()[id].error).toContain('connection lost')
  })

  it('cancel ends idle, not error, despite the rejected download promise', async () => {
    const { downloads, id } = fresh()
    await downloads.init()
    const done = downloads.start(id)
    await flush()
    await downloads.cancel(id)
    await done
    expect(downloads.getStates()[id].status).toBe('idle')
    expect(downloads.getStates()[id].error).toBeUndefined()
  })

  it('pause persists a resume snapshot and is a no-op without an active task', async () => {
    const { storage, downloads, id } = fresh()
    await downloads.init()
    await downloads.pause(id) // no task yet — must not throw or corrupt state
    expect(downloads.getStates()[id]).toBeUndefined()

    const run = downloads.start(id)
    await flush()
    await downloads.pause(id)
    await run // start() exits via the paused path (downloadAsync resolved null)
    expect(downloads.getStates()[id].status).toBe('paused')
    expect(storage.__map.get('marmot.downloads.resume.v1')).toContain('"rd"')
  })

  it('remove during an active download cancels the task and clears everything', async () => {
    const { fs, downloads, modelPath, id } = fresh()
    await downloads.init()
    const done = downloads.start(id)
    await flush()
    await downloads.remove(id)
    await done
    expect(downloads.getStates()[id].status).toBe('idle')
    expect(fs.__state.files.has(modelPath(id))).toBe(false)
    expect(fs.__state.files.has(`${modelPath(id)}.part`)).toBe(false)
  })

  it('a paused download resumes from the persisted snapshot without restarting', async () => {
    const { fs, storage, downloads, modelPath, id } = fresh()
    await downloads.init()

    // first "session": start and pause, leaving a .part + a saved snapshot
    const run = downloads.start(id)
    await flush()
    fs.__state.files.set(`${modelPath(id)}.part`, 1000)
    await downloads.pause(id)
    await run
    expect(downloads.getStates()[id].status).toBe('paused')
    const snapshot = storage.__map.get('marmot.downloads.resume.v1')
    expect(snapshot).toContain('"resumeData":"rd"')

    // simulate an app restart: throw away the live manager and re-init
    jest.resetModules()
    const storage2 = require('@react-native-async-storage/async-storage')
    // storage map persists across resetModules because the module-registry
    // reload re-runs the factory, so we must preserve the snapshot manually
    storage2.__map.set('marmot.downloads.resume.v1', snapshot)
    const reloaded = require('../downloads')
    await reloaded.downloads.init()
    expect(reloaded.downloads.getStates()[id].status).toBe('paused')

    const resumed = reloaded.downloads.start(id)
    await flush()
    // the restored task must be the one that drives to completion
    expect(fs.__state.resumables.length).toBeGreaterThan(0)
    const last = fs.__state.resumables[fs.__state.resumables.length - 1]
    expect(last._resumeData).toBe('rd') // resumed, not a fresh task
    last.finish(200, 1500)
    await resumed
    expect(reloaded.downloads.isDownloaded(id)).toBe(true)
    // snapshot is cleared once the download completes
    const stored = storage2.__map.get('marmot.downloads.resume.v1')
    const parsed = stored ? JSON.parse(stored) : {}
    expect(parsed[id]).toBeUndefined()
  })

  it('backgrounding the app pauses an active download; foregrounding resumes it', async () => {
    const { fs, downloads, appStateListeners, id } = fresh()
    await downloads.init()
    downloads.attachAppStateHandler()
    const done = downloads.start(id)
    await flush()
    expect(downloads.getStates()[id].status).toBe('downloading')

    // background: manager should pause and persist
    appStateListeners.forEach((fn: (s: string) => void) => fn('background'))
    await flush()
    expect(downloads.getStates()[id].status).toBe('paused')

    // foreground: manager should resume from the paused state. The resume
    // runs in a fresh start() promise; capture it via the in-flight task.
    appStateListeners.forEach((fn: (s: string) => void) => fn('active'))
    await flush()
    expect(downloads.getStates()[id].status).toBe('downloading')

    // complete cleanly to release the in-flight task
    const last = fs.__state.resumables[fs.__state.resumables.length - 1]
    last.finish(200)
    await done.catch(() => {}) // initial start() resolved undefined on pause
    // allow the resumed start()'s continuation (move + clear) to drain
    await flush()
    expect(downloads.isDownloaded(id)).toBe(true)
  })
})
