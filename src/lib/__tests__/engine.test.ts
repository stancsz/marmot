/**
 * Engine load-configuration tests: verifies the exact n_gpu_layers each
 * platform/setting combination sends to llama.rn, and the reload semantics
 * when the GPU setting changes.
 */

const platform = { OS: 'android' as 'android' | 'ios' }

jest.mock('react-native', () => ({ Platform: platform }))

const initCalls: any[] = []
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async (params: any) => {
    initCalls.push(params)
    return {
      completion: jest.fn(),
      stopCompletion: jest.fn(async () => {}),
      release: jest.fn(async () => {}),
      embedding: jest.fn(async () => ({ embedding: [] })),
    }
  }),
}))

jest.mock('../downloads', () => ({
  modelPath: (id: string) => `file:///models/${id}.gguf`,
}))

function fresh() {
  jest.resetModules()
  initCalls.length = 0
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { engine } = require('../engine')
  return engine
}

describe('LlamaEngine load configuration', () => {
  it('Android without the toggle stays on CPU (n_gpu_layers 0)', async () => {
    platform.OS = 'android'
    const engine = fresh()
    await engine.ensureLoaded('m1', 4096)
    expect(initCalls[0].n_gpu_layers).toBe(0)
    expect(initCalls[0].model).toBe('file:///models/m1.gguf')
    expect(initCalls[0].n_ctx).toBe(4096)
  })

  it('Android with the experimental toggle offloads (n_gpu_layers 99)', async () => {
    platform.OS = 'android'
    const engine = fresh()
    await engine.ensureLoaded('m1', 4096, { gpuAndroid: true })
    expect(initCalls[0].n_gpu_layers).toBe(99)
  })

  it('iOS always uses Metal regardless of the Android toggle', async () => {
    platform.OS = 'ios'
    const engine = fresh()
    await engine.ensureLoaded('m1', 4096, { gpuAndroid: false })
    expect(initCalls[0].n_gpu_layers).toBe(99)
  })

  it('flipping the GPU setting reloads the model; same config does not', async () => {
    platform.OS = 'android'
    const engine = fresh()
    await engine.ensureLoaded('m1', 4096)
    await engine.ensureLoaded('m1', 4096) // identical — no reload
    expect(initCalls).toHaveLength(1)
    await engine.ensureLoaded('m1', 4096, { gpuAndroid: true }) // changed — reload
    expect(initCalls).toHaveLength(2)
    expect(initCalls[1].n_gpu_layers).toBe(99)
  })

  it('context-length changes also trigger a reload', async () => {
    platform.OS = 'android'
    const engine = fresh()
    await engine.ensureLoaded('m1', 2048)
    await engine.ensureLoaded('m1', 8192)
    expect(initCalls).toHaveLength(2)
    expect(initCalls[1].n_ctx).toBe(8192)
  })
})
