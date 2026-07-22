import AsyncStorage from '@react-native-async-storage/async-storage'
import { engine } from './engine'
import { loadMcpAgentTools } from './mcpServers'
import { loadChats } from './chatStore'
import { visibleAnswer } from './thinking'
import { InferenceSettings } from '../types'
import {
  AgentCancelled,
  AgentLLM,
  AgentStep,
  DEFAULT_POLICIES,
  DocumentStore,
  MemoryStore,
  OrchestratorResult,
  Plan,
  VerifiedAnswer,
  calculatorTool,
  datetimeTool,
  makeCancellableLLM,
  makePlan,
  runAgentLoop,
  fetchPageTool,
  runOrchestratedTask,
  searchChatsTool,
  searchDocumentsTool,
  selectSkills,
  shouldPlan,
  verifyAnswer,
  webSearchTool,
} from '../agent'
import { classifyTask, tierPolicy } from '../agent/classifier'

/**
 * App-side wiring for the tested agent core: adapts LlamaEngine to the
 * AgentLLM interface and assembles tools + skills + memory for a run.
 * The model must already be loaded (ChatScreen calls engine.ensureLoaded).
 */

/**
 * JSON Schema that constrains agent action outputs to the two valid formats:
 *   {"thought":"…","action":"final","answer":"…"}
 *   {"thought":"…","action":"tool","tool":"<name>","args":{…}}
 *
 * llama.cpp converts this schema to a GBNF grammar at runtime, which
 * eliminates JSON parse failures and reduces tokens-per-action turn by
 * forcing the model down valid paths without re-sampling.
 */
const AGENT_ACTION_SCHEMA = JSON.stringify({
  oneOf: [
    {
      type: 'object',
      required: ['action', 'answer'],
      properties: {
        thought: { type: 'string' },
        action: { type: 'string', const: 'final' },
        answer: { type: 'string' },
        done_step: { type: 'number' },
      },
    },
    {
      type: 'object',
      required: ['action', 'tool'],
      properties: {
        thought: { type: 'string' },
        action: { type: 'string', const: 'tool' },
        tool: { type: 'string' },
        args: { type: 'object' },
        done_step: { type: 'number' },
      },
    },
  ],
})

/**
 * First-token confidence threshold for skipping verification.
 * When the model's top-1 token probability meets this bar, the answer is
 * treated as high-confidence and the reflection pass is bypassed — saving
 * a full LLM round-trip on decisive responses.
 */
const HIGH_CONFIDENCE_THRESHOLD = 0.70

/**
 * Build an AgentLLM bound to the loaded engine.
 *
 * @param settings    User inference settings.
 * @param tokenBudget Override maxTokens for this tier (quick/tool/research).
 * @param useGrammar  When true, inject the agent action JSON schema so the
 *                    model can only produce valid action JSON — no free-text
 *                    drift possible. Leave false for direct (non-JSON) turns.
 */
function engineLLM(
  settings: InferenceSettings,
  tokenBudget?: number,
  useGrammar = false
): AgentLLM {
  return {
    async complete(messages) {
      const result = await engine.complete(
        messages,
        // Per-tier token budget keeps quick turns lean and research turns rich.
        { ...settings, maxTokens: tokenBudget ?? settings.maxTokens, temperature: Math.min(settings.temperature, 0.7) },
        () => {},
        {
          // Agent turns must emit JSON promptly, not reason at length
          enableThinking: false,
          // Grammar-constrained sampling: only for structured action turns
          ...(useGrammar ? { json_schema: AGENT_ACTION_SCHEMA } : {}),
        }
      )
      // Strip reasoning so stray braces in think-blocks can't confuse the
      // JSON action parser
      return visibleAnswer(result.text)
    },
  }
}

/**
 * Embeddings come from the loaded chat model; when none is loaded (or the
 * model can't embed), MemoryStore falls back to keyword retrieval and
 * backfills vectors lazily on later retrieves.
 */
const engineEmbedder = {
  async embed(text: string): Promise<number[]> {
    const vector = await engine.embedText(text)
    if (!vector) throw new Error('embedding unavailable')
    return vector
  },
}

const httpFetcher = async (url: string): Promise<string> => {
  const res = await fetch(url, { headers: { 'User-Agent': 'Marmot/1.0 (mobile)' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

export const agentMemory = new MemoryStore(AsyncStorage, undefined, engineEmbedder)
export const agentDocuments = new DocumentStore(AsyncStorage, undefined, engineEmbedder)

export async function runAgentTask(
  task: string,
  settings: InferenceSettings,
  isCancelled: () => boolean,
  onStep: (step: AgentStep) => void,
  onPlan?: (plan: Plan) => void
): Promise<OrchestratorResult> {
  const mcpTools = await loadMcpAgentTools()
  const allTools = [
    calculatorTool(),
    datetimeTool(),
    searchChatsTool(loadChats),
    searchDocumentsTool((q) => agentDocuments.retrieve(q)),
    // Web tools exist only when the user has opted in — otherwise the
    // agent (and the app) is provably offline after model download
    ...(settings.allowWeb ? [webSearchTool(httpFetcher), fetchPageTool(httpFetcher)] : []),
    // MCP tools come from servers the user added explicitly in Settings
    ...mcpTools,
  ]

  // MCP tool names are dynamic — extend the policy allowlist with exactly
  // the tools that connected servers actually expose
  const allAllowedTools = [...DEFAULT_POLICIES.allowedTools, ...mcpTools.map((t) => t.name)]

  // ── Tier classification (zero tokens, <1ms) ───────────────────────────────
  // Classify before any LLM call. The tier drives token budgets, tool
  // injection, loop depth, and whether a planning pass runs at all.
  const tier = classifyTask(task, settings.allowWeb)
  const policy = tierPolicy(tier, task, allAllowedTools, settings.allowWeb)

  // ── Quick tier: true direct bypass — no loop, no JSON action schema ────────
  // Calling engine.complete() directly skips:
  //   • The agent system prompt (JSON action format instructions)
  //   • All tool descriptions (none injected for this tier)
  //   • The loop machinery (parse → act → observe cycle)
  //   • Grammar-constrained sampling (free-text is fine here)
  // This is the largest single latency reduction for everyday messages.
  if (tier === 'quick') {
    if (isCancelled()) throw new AgentCancelled()

    const memoryContext = await agentMemory.contextFor(task)
    const quickSteps: AgentStep[] = []
    const emitStep = (s: AgentStep) => { quickSteps.push(s); onStep(s) }

    emitStep({ kind: 'thought', content: 'Answering directly…' })

    // Lean conversational system prompt — no JSON schema, no tool list
    const sysPrompt = [
      settings.systemPrompt ?? 'You are Marmot, a helpful assistant running fully on-device.',
      memoryContext,
    ].filter(Boolean).join('\n\n')

    const result = await engine.complete(
      [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: task },
      ],
      { ...settings, maxTokens: policy.maxTokens, temperature: Math.min(settings.temperature, 0.7) },
      () => {},
      // n_probs: 1 costs essentially nothing and gives us the top-1 token
      // confidence — used below to gate the expensive verify pass
      { enableThinking: false, n_probs: 1 }
    )

    const answer = visibleAnswer(result.text)
    emitStep({ kind: 'final', content: answer })

    // ── Logprob-gated verification ────────────────────────────────────────
    // Skip the reflection/judge pass when the model was clearly decisive
    // (top-1 token prob ≥ HIGH_CONFIDENCE_THRESHOLD). This saves a full LLM
    // round-trip on simple factual answers while still verifying uncertain ones.
    if (settings.verifyAnswers && !isCancelled()) {
      const isHighConfidence =
        result.confidence !== undefined && result.confidence >= HIGH_CONFIDENCE_THRESHOLD
      if (!isHighConfidence) {
        const llm = makeCancellableLLM(engineLLM(settings), isCancelled)
        const verified = await verifyAnswer(llm, task, answer)
        if (verified.revised) {
          emitStep({ kind: 'final', content: verified.answer })
          return { answer: verified.answer, steps: quickSteps, truncated: false, retried: true }
        }
      }
    }

    return { answer, steps: quickSteps, truncated: false, retried: false }
  }

  // ── Tool / Research tiers — grammar-constrained agent loop ────────────────
  // Grammar forces the model to emit valid action JSON on every turn,
  // eliminating parse failures without any extra retry overhead.
  const llm = makeCancellableLLM(
    engineLLM(settings, policy.maxTokens, /* useGrammar */ true),
    isCancelled
  )
  const policies = {
    ...DEFAULT_POLICIES,
    allowedTools: allAllowedTools,
    maxSteps: policy.maxSteps,
  }
  const memoryContext = await agentMemory.contextFor(task)
  const skills = selectSkills(task)

  // Planning only makes sense for research-tier tasks — it costs a full LLM
  // round trip and offers no benefit for single-tool tasks.
  let plan: Plan | undefined
  if (tier === 'research' && shouldPlan(task)) {
    const candidate = await makePlan(llm, task)
    if (candidate.steps.length >= 2) {
      plan = candidate
      onPlan?.(candidate)
    }
  }

  // Multi-step tasks run orchestrated; single-tool tasks run the plain loop.
  if (plan) {
    return runOrchestratedTask({
      llm,
      task,
      tools: allTools,
      policies,
      skills,
      memoryContext,
      plan,
      persona: settings.systemPrompt,
      judgeGate: settings.verifyAnswers,
      onStep,
    })
  }

  const result = await runAgentLoop({
    llm,
    task,
    tools: allTools,
    policies,
    skills,
    memoryContext,
    persona: settings.systemPrompt,
    onStep,
    tokenBudget: policy.maxTokens,
    toolFilter: policy.toolFilter,
  })
  return { ...result, retried: false }
}

/** Reflection + judge pass over a finished answer, on the loaded model */
export async function verifyAgentAnswer(
  task: string,
  answer: string,
  settings: InferenceSettings,
  isCancelled: () => boolean
): Promise<VerifiedAnswer> {
  const llm = makeCancellableLLM(engineLLM(settings), isCancelled)
  return verifyAnswer(llm, task, answer)
}
