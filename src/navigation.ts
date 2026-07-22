import type { Attachment } from './types'

export type RootStackParamList = {
  Chats: undefined
  Chat: { chatId?: string; demo?: boolean }
  Models: undefined
  Settings: undefined
  Memory: undefined
  Voice: undefined
  Ingest: { text?: string; attachment?: Attachment } | undefined
  Flight: undefined
}
