export type ModelId = string

export type ModelModality = 'vision' | 'audio'

export interface ModelProjectorSpec {
  /** Projector URL paired with the model's GGUF weights. */
  url: string
  /** Exact hosted projector size, used for progress and device-fit estimates. */
  sizeBytes: number
  /** Capabilities exposed after the projector is initialized. */
  modalities: readonly ModelModality[]
}

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
  /** Optional multimodal projector that must be downloaded with the weights. */
  projector?: ModelProjectorSpec
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

export interface Attachment {
  /** stable file name as the user sees it */
  name: string
  /** mime type when known (jpg, png, application/pdf, text/plain, ...) */
  mimeType: string
  /** byte size at the time of import */
  sizeBytes: number
  /** absolute file:// URI on the device under the app's document directory */
  uri: string
}

export interface ChatMessage {
  id: string
  role: Role
  content: string
  createdAt: number
  stats?: MessageStats
  attachment?: Attachment
}

export type CompletionMessagePart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export type CompletionMessageContent = string | CompletionMessagePart[]

export interface CompletionMessage {
  role: Role
  content: CompletionMessageContent
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
  /** let the agent search the web and fetch pages; off = fully offline */
  allowWeb: boolean
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
