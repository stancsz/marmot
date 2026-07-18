import { KVStore, MemoryEntry, MemoryKind } from './types'
import { Embedder, cosineSimilarity, roundVector } from './semantic'

const MEMORY_KEY = 'marmot.agent.memory.v1'

/** episodic entries are auto-captured after every exchange — cap their growth */
export const EPISODIC_CAP = 50

/**
 * Deterministic one-line episodic summary of an exchange — no LLM call, so
 * capture adds zero latency and is fully testable.
 */
export function episodicSummary(task: string, answer: string): string {
  const clip = (s: string, n: number) => {
    const clean = s.replace(/\s+/g, ' ').trim()
    return clean.length > n ? `${clean.slice(0, n)}…` : clean
  }
  return `Asked: ${clip(task, 90)} — Answer: ${clip(answer, 140)}`
}

/**
 * Persistent memory over any KV backend (AsyncStorage in the app, a Map in
 * tests). Retrieval is keyword-overlap scoring with recency as tiebreak —
 * a deliberately simple local context engine (semantic embeddings via
 * llama.rn are a roadmap item).
 */
/** semantic matches below this cosine are noise, not recall */
const MIN_SEMANTIC_SCORE = 0.25
/** cap embedding backfills per retrieve so recall never stalls the loop */
const MAX_BACKFILL_PER_RETRIEVE = 5

export class MemoryStore {
  constructor(
    private kv: KVStore,
    private newId: () => string = defaultId,
    private embedder?: Embedder
  ) {}

  private async load(): Promise<MemoryEntry[]> {
    try {
      const raw = await this.kv.getItem(MEMORY_KEY)
      return raw ? (JSON.parse(raw) as MemoryEntry[]) : []
    } catch {
      return []
    }
  }

  private async save(entries: MemoryEntry[]): Promise<void> {
    await this.kv.setItem(MEMORY_KEY, JSON.stringify(entries))
  }

  async add(kind: MemoryKind, text: string, createdAt: number = Date.now()): Promise<MemoryEntry> {
    const entry: MemoryEntry = { id: this.newId(), kind, text: text.trim(), createdAt }
    if (this.embedder) {
      try {
        entry.embedding = roundVector(await this.embedder.embed(entry.text))
      } catch {
        // no model loaded / embedding unsupported — backfilled on retrieve
      }
    }
    let entries = await this.load()
    entries.push(entry)
    // keep episodic memory bounded: drop the oldest beyond the cap
    const episodic = entries.filter((e) => e.kind === 'episodic')
    if (episodic.length > EPISODIC_CAP) {
      const cutoff = episodic
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(0, episodic.length - EPISODIC_CAP)
        .map((e) => e.id)
      entries = entries.filter((e) => !cutoff.includes(e.id))
    }
    await this.save(entries)
    return entry
  }

  async all(kind?: MemoryKind): Promise<MemoryEntry[]> {
    const entries = await this.load()
    return kind ? entries.filter((e) => e.kind === kind) : entries
  }

  async remove(id: string): Promise<void> {
    const entries = await this.load()
    await this.save(entries.filter((e) => e.id !== id))
  }

  /** semantic (cosine) retrieval when an embedder is available; keyword fallback */
  async retrieve(query: string, k = 4): Promise<MemoryEntry[]> {
    const entries = await this.load()
    if (this.embedder) {
      try {
        const queryVector = await this.embedder.embed(query)
        // lazily backfill vectors for entries stored while no model was loaded
        let backfilled = 0
        for (const e of entries) {
          if (!e.embedding && backfilled < MAX_BACKFILL_PER_RETRIEVE) {
            try {
              e.embedding = roundVector(await this.embedder.embed(e.text))
              backfilled++
            } catch {
              break
            }
          }
        }
        if (backfilled > 0) await this.save(entries)

        const scored = entries
          .map((e) => ({
            e,
            // entries still lacking a vector fall back to a 0..1 keyword score
            score: e.embedding
              ? cosineSimilarity(queryVector, e.embedding)
              : keywordScore01(query, e.text),
          }))
          .filter((s) => s.score >= MIN_SEMANTIC_SCORE)
          .sort((a, b) => b.score - a.score || b.e.createdAt - a.e.createdAt)
        return scored.slice(0, k).map((s) => s.e)
      } catch {
        // embedder unavailable right now — fall through to keyword
      }
    }
    return this.keywordRetrieve(query, k, entries)
  }

  private keywordRetrieve(query: string, k: number, entries: MemoryEntry[]): MemoryEntry[] {
    const words = tokenize(query)
    const scored = entries
      .map((e) => {
        const entryWords = new Set(tokenize(e.text))
        const overlap = words.reduce((acc, w) => acc + (entryWords.has(w) ? 1 : 0), 0)
        return { e, overlap }
      })
      .filter((s) => s.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap || b.e.createdAt - a.e.createdAt)
    return scored.slice(0, k).map((s) => s.e)
  }

  /** context block injected into the agent's system prompt */
  async contextFor(query: string, k = 4): Promise<string> {
    const hits = await this.retrieve(query, k)
    if (hits.length === 0) return ''
    return `Relevant memory:\n${hits.map((h) => `- (${h.kind}) ${h.text}`).join('\n')}`
  }
}

function keywordScore01(query: string, text: string): number {
  const words = tokenize(query)
  if (words.length === 0) return 0
  const entryWords = new Set(tokenize(text))
  const overlap = words.reduce((acc, w) => acc + (entryWords.has(w) ? 1 : 0), 0)
  return overlap / words.length
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2)
}

function defaultId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
