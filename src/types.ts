export type ModelId = string

export interface ModelSpec {
  id: ModelId
  name: string
  family: string
  params: string
  quant: string
  sizeBytes: number
  url: string
  description: string
  license: string
  /** true if the model emits <think>...</think> reasoning blocks */
  thinking?: boolean
}

export type Role = 'system' | 'user' | 'assistant'

export interface MessageStats {
  tokensPerSecond?: number
  predictedTokens?: number
  /** present when the answer went through the reflection+judge pass */
  verify?: {
    accept: boolean
    score: number
    revised: boolean
  }
}

export interface ChatMessage {
  id: string
  role: Role
  content: string
  createdAt: number
  stats?: MessageStats
}

export interface Chat {
  id: string
  title: string
  modelId: ModelId | null
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

export interface InferenceSettings {
  temperature: number
  topP: number
  maxTokens: number
  contextLength: number
  systemPrompt: string
  /** run reflection + judge after each Agent Mode answer (2 extra passes) */
  verifyAnswers: boolean
  /** experimental: offload layers to the GPU on Android (OpenCL, Adreno) */
  gpuAndroid: boolean
}

export type DownloadStatus =
  | 'idle'
  | 'downloading'
  | 'paused'
  | 'done'
  | 'error'

export interface DownloadState {
  modelId: ModelId
  status: DownloadStatus
  progress: number // 0..1
  receivedBytes: number
  totalBytes: number
  error?: string
}

export type RamFit = 'great' | 'ok' | 'risky' | 'unknown'
