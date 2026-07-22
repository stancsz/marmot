import { Chat, ChatMessage } from '../types'

/**
 * Pure parse + merge logic for restoring Marmot JSON exports — no RN
 * imports, fully unit-tested. File I/O and UI live in SettingsScreen.
 */

const SUPPORTED_VERSION = 1

export function parseChatExport(raw: string): Chat[] {
  let data: any
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  if (data?.app !== 'marmot') throw new Error('That file is not a Marmot export.')
  if (typeof data.version !== 'number' || data.version > SUPPORTED_VERSION) {
    throw new Error(`Unsupported export version (${data?.version}). Update Marmot and try again.`)
  }
  if (!Array.isArray(data.chats)) throw new Error('No chats found in the file.')

  const chats = data.chats.map(coerceChat).filter((c: Chat | null): c is Chat => c !== null)
  if (chats.length === 0) throw new Error('No valid chats found in the file.')
  return chats
}

function coerceChat(input: unknown): Chat | null {
  if (!input || typeof input !== 'object') return null
  const c = input as Record<string, unknown>
  if (typeof c.id !== 'string' || !c.id) return null
  if (!Array.isArray(c.messages)) return null
  const messages = c.messages
    .map(coerceMessage)
    .filter((m: ChatMessage | null): m is ChatMessage => m !== null)
  return {
    id: c.id,
    title: typeof c.title === 'string' && c.title ? c.title : 'Imported chat',
    modelId: typeof c.modelId === 'string' ? c.modelId : null,
    messages,
    createdAt: toTime(c.createdAt),
    updatedAt: toTime(c.updatedAt),
  }
}

function coerceMessage(input: unknown): ChatMessage | null {
  if (!input || typeof input !== 'object') return null
  const m = input as Record<string, unknown>
  if (m.role !== 'user' && m.role !== 'assistant' && m.role !== 'system') return null
  if (typeof m.content !== 'string') return null
  const out: ChatMessage = {
    id: typeof m.id === 'string' && m.id ? m.id : `imp-${Math.random().toString(36).slice(2, 10)}`,
    role: m.role,
    content: m.content,
    createdAt: toTime(m.createdAt),
    stats: undefined,
  }
  // attachments are best-effort restored: if a future export shape carries
  // them, preserve what we can; missing fields drop the metadata rather
  // than fabricating a stale uri
  const a = m.attachment
  if (a && typeof a === 'object') {
    const aa = a as Record<string, unknown>
    if (
      typeof aa.uri === 'string' &&
      typeof aa.name === 'string' &&
      typeof aa.mimeType === 'string' &&
      typeof aa.sizeBytes === 'number'
    ) {
      out.attachment = {
        uri: aa.uri,
        name: aa.name,
        mimeType: aa.mimeType,
        sizeBytes: aa.sizeBytes,
      }
    }
  }
  return out
}

function toTime(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : Date.now()
}

export interface MergeResult {
  chats: Chat[]
  added: number
  updated: number
  skipped: number
}

/**
 * Merge imported chats into existing ones by id. An import only replaces an
 * existing chat when it knows more (more messages, or newer with the same
 * count) — a stale backup never clobbers newer local history.
 */
export function mergeChats(existing: Chat[], imported: Chat[]): MergeResult {
  const byId = new Map(existing.map((c) => [c.id, c]))
  let added = 0
  let updated = 0
  let skipped = 0
  for (const chat of imported) {
    const current = byId.get(chat.id)
    if (!current) {
      byId.set(chat.id, chat)
      added++
    } else if (
      chat.messages.length > current.messages.length ||
      (chat.messages.length === current.messages.length && chat.updatedAt > current.updatedAt)
    ) {
      byId.set(chat.id, chat)
      updated++
    } else {
      skipped++
    }
  }
  const chats = [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt)
  return { chats, added, updated, skipped }
}
