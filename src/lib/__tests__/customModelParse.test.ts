import { customModelFromFile, MIN_GGUF_BYTES } from '../customModelParse'

const GB = 1_000_000_000

describe('customModelFromFile', () => {
  it('derives a readable name, quant, and slug id from the filename', () => {
    const spec = customModelFromFile('Llama-3.2-1B-Instruct-Q4_K_M.gguf', GB, [])
    expect(spec.name).toBe('Llama 3.2 1B Instruct Q4 K M')
    expect(spec.quant).toBe('Q4_K_M')
    expect(spec.id).toBe('custom-llama-3-2-1b-instruct-q4-k-m')
    expect(spec.sizeBytes).toBe(GB)
    expect(spec.family).toBe('Imported')
  })

  it('rejects non-gguf files and implausibly small files', () => {
    expect(() => customModelFromFile('model.bin', GB, [])).toThrow('.gguf')
    expect(() => customModelFromFile('tiny.gguf', MIN_GGUF_BYTES - 1, [])).toThrow('too small')
    expect(() => customModelFromFile('nan.gguf', NaN, [])).toThrow('too small')
  })

  it('detects IQ quants and falls back to GGUF when none present', () => {
    expect(customModelFromFile('model-IQ4_XS.gguf', GB, []).quant).toBe('IQ4_XS')
    expect(customModelFromFile('mystery-model.gguf', GB, []).quant).toBe('GGUF')
  })

  it('suffixes the id on collision with existing models', () => {
    const taken = ['custom-my-model', 'custom-my-model-2']
    expect(customModelFromFile('my model.gguf', GB, taken).id).toBe('custom-my-model-3')
  })

  it('survives hostile filenames', () => {
    const spec = customModelFromFile('___.gguf', GB, [])
    expect(spec.id).toBe('custom-model')
    expect(spec.name).toBe('Imported model')
  })
})
