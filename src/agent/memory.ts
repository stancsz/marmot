import { KVStore, MemoryEntry, MemoryKind } from './types'

const MEMORY_KEY = 'marmot.agent.memory.v1'

/**
 * Persistent memory over any KV backend (AsyncStorage in the app, a Map in
 * tests). Retrieval is keyword-overlap scoring with recency as tiebreak —
 * a deliberately simple local context engine (semantic embeddings via
 * llama.rn are a roadmap item).
 */
export class MemoryStore {
  constructor(private kv: KVStore, private newId: () => string = defaultId) {}

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
    const entries = await this.load()
    entries.push(entry)
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

  /** keyword-overlap retrieval, recency as tiebreak */
  async retrieve(query: string, k = 4): Promise<MemoryEntry[]> {
    const words = tokenize(query)
    const entries = await this.load()
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

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2)
}

function defaultId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
