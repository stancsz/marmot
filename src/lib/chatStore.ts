import AsyncStorage from '@react-native-async-storage/async-storage'
import { Chat, ChatMessage, InferenceSettings } from '../types'

const CHATS_KEY = 'marmot.chats.v1'
const SETTINGS_KEY = 'marmot.settings.v1'

export const DEFAULT_SETTINGS: InferenceSettings = {
  temperature: 0.7,
  topP: 0.9,
  maxTokens: 1024,
  contextLength: 4096,
  systemPrompt:
    'You are a helpful assistant running locally on the user’s phone. Be concise.',
  verifyAnswers: false,
  gpuAndroid: false,
  allowWeb: false,
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function newChat(modelId: string | null): Chat {
  const now = Date.now()
  return {
    id: newId(),
    title: 'New chat',
    modelId,
    messages: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function newMessage(role: ChatMessage['role'], content: string, attachment?: ChatMessage['attachment']): ChatMessage {
  const msg: ChatMessage = { id: newId(), role, content, createdAt: Date.now() }
  if (attachment) msg.attachment = attachment
  return msg
}

export async function loadChats(): Promise<Chat[]> {
  try {
    const raw = await AsyncStorage.getItem(CHATS_KEY)
    const chats: Chat[] = raw ? JSON.parse(raw) : []
    return chats.sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

// Chat writes are read-modify-write over one AsyncStorage key; concurrent
// writers (send persisting + model auto-adopt, for example) would silently
// drop each other's changes. Serialize them through a queue.
let writeQueue: Promise<unknown> = Promise.resolve()
function enqueueWrite<T>(op: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(op, op)
  writeQueue = run.catch(() => {})
  return run
}

export function saveChat(chat: Chat): Promise<void> {
  return enqueueWrite(async () => {
    const chats = await loadChats()
    const idx = chats.findIndex((c) => c.id === chat.id)
    if (idx >= 0) chats[idx] = chat
    else chats.unshift(chat)
    await AsyncStorage.setItem(CHATS_KEY, JSON.stringify(chats))
  })
}

/** replace the whole chat list (used by import) — serialized like all writes */
export function saveAllChats(chats: Chat[]): Promise<void> {
  return enqueueWrite(() => AsyncStorage.setItem(CHATS_KEY, JSON.stringify(chats)))
}

export function deleteChat(chatId: string): Promise<void> {
  return enqueueWrite(async () => {
    const chats = await loadChats()
    await AsyncStorage.setItem(CHATS_KEY, JSON.stringify(chats.filter((c) => c.id !== chatId)))
  })
}

export async function loadSettings(): Promise<InferenceSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY)
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

export async function saveSettings(settings: InferenceSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

export function chatTitleFrom(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > 42 ? `${clean.slice(0, 42)}…` : clean || 'New chat'
}
