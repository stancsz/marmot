import { initLlama, LlamaContext } from 'llama.rn'
import { Platform } from 'react-native'
import { modelPath, projectorPath } from './downloads'
import { getModel } from '../models/catalog'
import { CompletionMessage, InferenceSettings, MessageStats, ModelId } from '../types'

export interface CompletionResult {
  text: string
  stats: MessageStats
  /**
   * Confidence of the first generated token (0–1), only set when n_probs > 0
   * is passed. Use as a cheap proxy for answer confidence to skip expensive
   * verify passes on high-confidence responses.
   */
  confidence?: number
}

type EngineStatus = 'unloaded' | 'loading' | 'ready' | 'generating'

/**
 * Single global llama.cpp context. Only one model is loaded at a time —
 * phones don't have RAM to spare, so switching models releases the old
 * context first. Load/complete are single-flight: a new call preempts a
 * stale in-flight one (e.g. left running by a screen the user navigated
 * away from) rather than racing the native context or blocking on it.
 */
export interface EngineLoadOptions {
  /** experimental Android GPU offload (OpenCL); iOS always uses Metal */
  gpuAndroid?: boolean
}

export interface LoadedModalities {
  vision: boolean
  audio: boolean
}

class LlamaEngine {
  private context: LlamaContext | null = null
  private loadedModelId: ModelId | null = null
  private loadedContextLength = 0
  private loadedGpuAndroid = false
  private loadedModalities: LoadedModalities = { vision: false, audio: false }
  private status: EngineStatus = 'unloaded'
  // bumped on every complete() call so a stale request's finally block
  // can never clobber a newer one's status (see preemptStaleGeneration)
  private generation = 0

  getStatus(): EngineStatus {
    return this.status
  }

  getLoadedModelId(): ModelId | null {
    return this.loadedModelId
  }

  getLoadedModalities(): LoadedModalities {
    return { ...this.loadedModalities }
  }

  /**
   * A screen that navigated away mid-reply (or a new chat started while an
   * old one was still answering) leaves the engine — a global singleton —
   * stuck 'generating', which used to surface as "Model is busy" to an
   * unrelated caller. Kill the stale generation instead of blocking on it.
   */
  private async preemptStaleGeneration(): Promise<void> {
    if (this.status !== 'generating') return
    await this.stop()
    const start = Date.now()
    while (this.status === 'generating' && Date.now() - start < 3000) {
      await new Promise((resolve) => setTimeout(resolve, 40))
    }
  }

  private async releaseContext(): Promise<void> {
    if (!this.context) return
    const ctx = this.context
    const wasGenerating = this.status === 'generating'
    this.context = null
    this.loadedModelId = null
    this.loadedModalities = { vision: false, audio: false }
    // never release a context mid-generation — stop first so the native
    // side settles before the memory is freed
    if (wasGenerating) await Promise.resolve(ctx.stopCompletion()).catch(() => {})
    if (typeof (ctx as any).releaseMultimodal === 'function') {
      await (ctx as any).releaseMultimodal().catch(() => {})
    }
    await ctx.release().catch(() => {})
  }

  async ensureLoaded(
    modelId: ModelId,
    contextLength: number,
    options: EngineLoadOptions = {}
  ): Promise<void> {
    const gpuAndroid = options.gpuAndroid ?? false
    await this.preemptStaleGeneration()
    if (
      this.context &&
      this.loadedModelId === modelId &&
      this.loadedContextLength === contextLength &&
      this.loadedGpuAndroid === gpuAndroid
    ) {
      return
    }
    if (this.status === 'loading' || this.status === 'generating') {
      throw new Error('Model is busy — try again in a moment')
    }
    this.status = 'loading'
    let ctx: LlamaContext | null = null
    try {
      await this.releaseContext()
      const spec = getModel(modelId)
      const projector = spec?.projector
      ctx = await initLlama({
        model: modelPath(modelId),
        n_ctx: contextLength,
        n_batch: 512,
        // Metal on iOS always; Android offloads only with the experimental
        // opt-in (OpenCL on supported Adreno chips), else optimized CPU
        n_gpu_layers: Platform.OS === 'ios' || gpuAndroid ? 99 : 0,
        use_mlock: false,
        ...(projector ? { ctx_shift: false } : {}),
      })
      if (projector) {
        const initialized = await ctx.initMultimodal({
          path: projectorPath(modelId),
          use_gpu: Platform.OS === 'ios' || gpuAndroid,
          image_max_tokens: 512,
        })
        const support = initialized
          ? await ctx.getMultimodalSupport()
          : { vision: false, audio: false }
        if (!initialized || !support.vision) {
          throw new Error('The vision projector could not be initialized for this model.')
        }
        this.loadedModalities = support
      }
      this.context = ctx
      this.loadedModelId = modelId
      this.loadedContextLength = contextLength
      this.loadedGpuAndroid = gpuAndroid
      this.status = 'ready'
    } catch (e) {
      if (ctx && this.context !== ctx) {
        if (typeof (ctx as any).releaseMultimodal === 'function') {
          await (ctx as any).releaseMultimodal().catch(() => {})
        }
        await ctx.release().catch(() => {})
      }
      this.context = null
      this.loadedModelId = null
      this.loadedModalities = { vision: false, audio: false }
      this.status = 'unloaded'
      throw e
    }
  }

  async unload(): Promise<void> {
    await this.releaseContext()
    this.status = 'unloaded'
  }

  async complete(
    messages: CompletionMessage[],
    settings: InferenceSettings,
    onToken: (token: string) => void,
    options: {
      enableThinking?: boolean
      /** GBNF grammar string to constrain the model's output format */
      grammar?: string
      /**
       * JSON Schema (serialised as a JSON string) that llama.cpp converts to
       * a GBNF grammar for structured output. Overridden by grammar when both
       * are supplied.
       */
      json_schema?: string
      /**
       * Request top-N token probabilities per generated token.
       * Set to 1 to get the first-token confidence for logprob-gated verify.
       * 0 = disabled (default).
       */
      n_probs?: number
    } = {}
  ): Promise<CompletionResult> {
    await this.preemptStaleGeneration()
    const ctx = this.context
    if (!ctx) throw new Error('No model loaded')
    if (this.status !== 'ready') throw new Error('Model is busy — try again in a moment')
    const myGeneration = ++this.generation
    this.status = 'generating'
    try {
      const result = await ctx.completion(
        {
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          n_predict: settings.maxTokens,
          temperature: settings.temperature,
          top_p: settings.topP,
          // reasoning templates (Qwen3.5) open a <think> block in the prompt
          // itself; one-shot consumers pass false to get direct answers
          // instead of minutes of think-tokens (found in emulator E2E)
          ...(options.enableThinking === undefined
            ? {}
            : { enable_thinking: options.enableThinking }),
          // grammar-constrained sampling: eliminates parse failures and reduces
          // tokens-per-action on structured (agent) turns
          ...(options.grammar ? { grammar: options.grammar } : {}),
          ...(options.json_schema ? { json_schema: options.json_schema } : {}),
          // token-probability sampling for logprob confidence gating
          ...(options.n_probs ? { n_probs: options.n_probs } : {}),
        },
        (data) => {
          if (data.token) onToken(data.token)
        }
      )
      // Extract top-1 confidence from the first generated token's probability
      // distribution. High values (≥ 0.7) signal the model was decisive;
      // callers use this to skip expensive reflection/verify passes.
      const confidence =
        options.n_probs && result.completion_probabilities?.length
          ? result.completion_probabilities[0]?.probs?.[0]?.prob
          : undefined
      return {
        text: result.text,
        stats: {
          tokensPerSecond: result.timings?.predicted_per_second,
          predictedTokens: result.timings?.predicted_n,
        },
        confidence,
      }
    } finally {
      // only restore 'ready' if our context is still the live one and no
      // newer call has taken over — otherwise a stale call's finally
      // (settling after preemptStaleGeneration killed it) could clobber
      // the status a newer, still-running generation just set
      if (this.context === ctx && this.generation === myGeneration) this.status = 'ready'
    }
  }

  async stop(): Promise<void> {
    if (this.context) {
      await Promise.resolve(this.context.stopCompletion()).catch(() => {})
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
