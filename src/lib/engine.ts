import { initLlama, LlamaContext } from 'llama.rn'
import { Platform } from 'react-native'
import { modelPath } from './downloads'
import { ChatMessage, InferenceSettings, MessageStats, ModelId } from '../types'

export interface CompletionResult {
  text: string
  stats: MessageStats
}

type EngineStatus = 'unloaded' | 'loading' | 'ready' | 'generating'

/**
 * Single global llama.cpp context. Only one model is loaded at a time —
 * phones don't have RAM to spare, so switching models releases the old
 * context first. Load/complete are single-flight: concurrent callers get a
 * "busy" error instead of racing the native context.
 */
class LlamaEngine {
  private context: LlamaContext | null = null
  private loadedModelId: ModelId | null = null
  private loadedContextLength = 0
  private status: EngineStatus = 'unloaded'

  getStatus(): EngineStatus {
    return this.status
  }

  getLoadedModelId(): ModelId | null {
    return this.loadedModelId
  }

  private async releaseContext(): Promise<void> {
    if (!this.context) return
    const ctx = this.context
    const wasGenerating = this.status === 'generating'
    this.context = null
    this.loadedModelId = null
    // never release a context mid-generation — stop first so the native
    // side settles before the memory is freed
    if (wasGenerating) await ctx.stopCompletion().catch(() => {})
    await ctx.release().catch(() => {})
  }

  async ensureLoaded(modelId: ModelId, contextLength: number): Promise<void> {
    if (
      this.context &&
      this.loadedModelId === modelId &&
      this.loadedContextLength === contextLength
    ) {
      return
    }
    if (this.status === 'loading' || this.status === 'generating') {
      throw new Error('Model is busy — try again in a moment')
    }
    this.status = 'loading'
    try {
      await this.releaseContext()
      const ctx = await initLlama({
        model: modelPath(modelId),
        n_ctx: contextLength,
        n_batch: 512,
        // Metal on iOS; on Android llama.rn falls back to optimized CPU
        n_gpu_layers: Platform.OS === 'ios' ? 99 : 0,
        use_mlock: false,
      })
      this.context = ctx
      this.loadedModelId = modelId
      this.loadedContextLength = contextLength
      this.status = 'ready'
    } catch (e) {
      this.context = null
      this.loadedModelId = null
      this.status = 'unloaded'
      throw e
    }
  }

  async unload(): Promise<void> {
    await this.releaseContext()
    this.status = 'unloaded'
  }

  async complete(
    messages: Pick<ChatMessage, 'role' | 'content'>[],
    settings: InferenceSettings,
    onToken: (token: string) => void
  ): Promise<CompletionResult> {
    const ctx = this.context
    if (!ctx) throw new Error('No model loaded')
    if (this.status !== 'ready') throw new Error('Model is busy — try again in a moment')
    this.status = 'generating'
    try {
      const result = await ctx.completion(
        {
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          n_predict: settings.maxTokens,
          temperature: settings.temperature,
          top_p: settings.topP,
        },
        (data) => {
          if (data.token) onToken(data.token)
        }
      )
      return {
        text: result.text,
        stats: {
          tokensPerSecond: result.timings?.predicted_per_second,
          predictedTokens: result.timings?.predicted_n,
        },
      }
    } finally {
      // only restore 'ready' if our context is still the live one — a
      // concurrent unload/load must not have its status clobbered
      if (this.context === ctx) this.status = 'ready'
    }
  }

  async stop(): Promise<void> {
    if (this.context) {
      await this.context.stopCompletion().catch(() => {})
    }
  }

  /**
   * Embed text with the loaded model, or null when unavailable (no model,
   * busy, or the model doesn't support embeddings). Callers must treat
   * null as "fall back to keyword retrieval".
   */
  async embedText(text: string): Promise<number[] | null> {
    const ctx = this.context
    if (!ctx || this.status !== 'ready') return null
    try {
      const result = await ctx.embedding(text)
      return result.embedding?.length ? result.embedding : null
    } catch {
      return null
    }
  }
}

export const engine = new LlamaEngine()
