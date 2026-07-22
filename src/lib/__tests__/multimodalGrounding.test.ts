const platform = { OS: 'android' as 'android' | 'ios' }
const initCalls: any[] = []
const releaseMultimodal = jest.fn(async () => {})
const initMultimodal = jest.fn(async () => true)
const getMultimodalSupport = jest.fn(async () => ({ vision: true, audio: false }))

jest.mock('react-native', () => ({ Platform: platform }))

jest.mock('expo-file-system', () => ({
  File: class MockFile {
    constructor(readonly uri: string) {}
  },
}))

jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn(),
}))

jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async (params: any) => {
    initCalls.push(params)
    return {
      initMultimodal,
      getMultimodalSupport,
      releaseMultimodal,
      release: jest.fn(async () => {}),
      stopCompletion: jest.fn(async () => {}),
    }
  }),
}))

jest.mock('../downloads', () => ({
  modelPath: (id: string) => `file:///models/${id}.gguf`,
  projectorPath: (id: string) => `file:///models/${id}.mmproj.gguf`,
}))

import { CATALOG, totalDownloadBytes } from '../../models/catalog'
import { buildCompletionMessages } from '../attachmentContext'

const image = {
  name: 'receipt.png',
  mimeType: 'image/png',
  sizeBytes: 120,
  uri: 'file:///attachments/receipt.png',
} as const

describe('multimodal grounding contract', () => {
  beforeEach(() => {
    initCalls.length = 0
    initMultimodal.mockClear()
    getMultimodalSupport.mockClear()
    releaseMultimodal.mockClear()
  })

  it('catalogs a paired vision model with exact combined download size', () => {
    const model = CATALOG.find((entry) => entry.id === 'smolvlm-256m')
    expect(model?.projector?.modalities).toContain('vision')
    expect(model?.sizeBytes).toBe(175_054_528)
    expect(model?.projector?.sizeBytes).toBe(190_031_616)
    expect(totalDownloadBytes(model!)).toBe(365_086_144)
  })

  it('passes a local image URI as structured content only with vision support', async () => {
    const grounded = await buildCompletionMessages(
      [{ role: 'user', content: 'What is the total?', attachment: image }],
      { vision: true }
    )
    const parts = grounded[0].content as any[]
    expect(parts).toEqual([
      { type: 'text', text: 'What is the total?' },
      { type: 'image_url', image_url: { url: image.uri } },
    ])

    const fallback = await buildCompletionMessages(
      [{ role: 'user', content: 'What is the total?', attachment: image }],
      { vision: false }
    )
    expect(fallback[0].content).toMatch(/cannot inspect an image/i)
    expect(fallback[0].content).toMatch(/compatible multimodal model/i)
  })
})

describe('multimodal engine lifecycle', () => {
  it('initializes and releases the paired projector', async () => {
    const { engine } = require('../engine')
    await engine.ensureLoaded('smolvlm-256m', 2048)

    expect(initCalls[0]).toMatchObject({
      model: 'file:///models/smolvlm-256m.gguf',
      ctx_shift: false,
    })
    expect(initMultimodal).toHaveBeenCalledWith({
      path: 'file:///models/smolvlm-256m.mmproj.gguf',
      use_gpu: false,
      image_max_tokens: 512,
    })
    expect(engine.getLoadedModalities()).toEqual({ vision: true, audio: false })

    await engine.unload()
    expect(releaseMultimodal).toHaveBeenCalled()
  })
})
