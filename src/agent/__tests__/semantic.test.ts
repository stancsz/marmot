import { cosineSimilarity, roundVector, Embedder } from '../semantic'
import { MemoryStore } from '../memory'
import { KVStore } from '../types'

function memoryKV(): KVStore {
  const map = new Map<string, string>()
  return {
    async getItem(k) {
      return map.get(k) ?? null
    },
    async setItem(k, v) {
      map.set(k, v)
    },
  }
}

describe('cosineSimilarity', () => {
  it('is 1 for identical, 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1)
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0)
  })
  it('is 0 for zero or mismatched vectors', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0)
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0)
    expect(cosineSimilarity([], [])).toBe(0)
  })
  it('roundVector shrinks precision to 4 decimals', () => {
    expect(roundVector([0.123456789, 1])).toEqual([0.1235, 1])
  })
})

/** lookup-table embedder — deterministic vectors, throws on unknown text */
function tableEmbedder(table: Record<string, number[]>, failFor: Set<string> = new Set()): Embedder {
  return {
    async embed(text) {
      if (failFor.has(text)) throw new Error('no model loaded')
      const v = table[text]
      if (!v) throw new Error(`no vector for: ${text}`)
      return v
    },
  }
}

describe('semantic retrieval', () => {
  const FACT = 'prefers metric units'
  const NOISE = 'pasta needs salted water'
  const QUERY = 'measurement system preference?'
  const table: Record<string, number[]> = {
    [FACT]: [1, 0, 0],
    [NOISE]: [0, 1, 0],
    [QUERY]: [0.95, 0.05, 0],
  }

  it('retrieves by meaning even with zero keyword overlap, and filters noise', async () => {
    let id = 0
    const store = new MemoryStore(memoryKV(), () => `id-${id++}`, tableEmbedder(table))
    await store.add('user', FACT, 1)
    await store.add('user', NOISE, 2)

    const hits = await store.retrieve(QUERY)
    expect(hits.map((h) => h.text)).toEqual([FACT]) // noise below threshold, fact above
  })

  it('backfills vectors for entries stored while embedding was unavailable', async () => {
    let id = 0
    const failFor = new Set([FACT])
    const store = new MemoryStore(memoryKV(), () => `id-${id++}`, tableEmbedder(table, failFor))
    await store.add('user', FACT, 1) // embed fails here — stored without vector
    expect((await store.all())[0].embedding).toBeUndefined()

    failFor.clear() // "model loaded now"
    const hits = await store.retrieve(QUERY)
    expect(hits.map((h) => h.text)).toEqual([FACT])
    expect((await store.all())[0].embedding).toEqual([1, 0, 0]) // persisted backfill
  })

  it('falls back to keyword retrieval when the embedder is down', async () => {
    const alwaysFail: Embedder = {
      async embed() {
        throw new Error('unavailable')
      },
    }
    let id = 0
    const store = new MemoryStore(memoryKV(), () => `id-${id++}`, alwaysFail)
    await store.add('project', 'marmot uses llama.cpp inference', 1)
    const hits = await store.retrieve('what inference does marmot use')
    expect(hits).toHaveLength(1)
    expect(hits[0].text).toContain('llama.cpp')
  })
})
