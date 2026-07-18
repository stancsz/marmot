import { ModelSpec } from '../types'

/**
 * Pure logic for turning a picked .gguf file into a custom ModelSpec —
 * validation, display-name derivation, quant detection, id slugging with
 * collision handling. File I/O lives in customModels.ts.
 */

/** anything smaller than this is not a usable model file */
export const MIN_GGUF_BYTES = 10_000_000

export function customModelFromFile(
  filename: string,
  sizeBytes: number,
  existingIds: string[]
): ModelSpec {
  if (!/\.gguf$/i.test(filename)) throw new Error('Pick a .gguf model file.')
  if (!Number.isFinite(sizeBytes) || sizeBytes < MIN_GGUF_BYTES) {
    throw new Error('That file is too small to be a usable model.')
  }

  const base = filename.replace(/\.gguf$/i, '')
  const name = base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Imported model'

  const quantMatch = base.match(/\b(IQ\d[A-Za-z0-9_]*|Q\d[A-Za-z0-9_]*)\b/i)
  const quant = quantMatch ? quantMatch[1].toUpperCase() : 'GGUF'

  const slug =
    'custom-' +
    (base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'model')
  let id = slug
  let n = 2
  while (existingIds.includes(id)) id = `${slug}-${n++}`

  return {
    id,
    name,
    family: 'Imported',
    params: '—',
    quant,
    sizeBytes,
    url: '',
    description: 'Imported from your files. Runs fully on-device like any catalog model.',
    license: 'User-provided',
  }
}
