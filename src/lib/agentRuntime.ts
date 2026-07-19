import AsyncStorage from '@react-native-async-storage/async-storage'
import { engine } from './engine'
import { loadMcpAgentTools } from './mcpServers'
import { loadChats } from './chatStore'
import { InferenceSettings } from '../types'
import {
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

/**
 * App-side wiring for the tested agent core: adapts LlamaEngine to the
 * AgentLLM interface and assembles tools + skills + memory for a run.
 * The model must already be loaded (ChatScreen calls engine.ensureLoaded).
 */

function engineLLM(settings: InferenceSettings): AgentLLM {
  return {
    async complete(messages) {
      const result = await engine.complete(
        messages,
        // agent turns need format discipline more than creativity
        { ...settings, temperature: Math.min(settings.temperature, 0.7) },
        () => {}
      )
      return result.text
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
  const llm = makeCancellableLLM(engineLLM(settings), isCancelled)
  const mcpTools = await loadMcpAgentTools()
  const tools = [
    calculatorTool(),
    datetimeTool(),
    searchChatsTool(loadChats),
    searchDocumentsTool((q) => agentDocuments.retrieve(q)),
    // web tools exist only when the user has opted in — otherwise the
    // agent (and the app) is provably offline after model download
    ...(settings.allowWeb ? [webSearchTool(httpFetcher), fetchPageTool(httpFetcher)] : []),
    // MCP tools come from servers the user added explicitly in Settings
    ...mcpTools,
  ]
  // MCP tool names are dynamic — extend the policy allowlist with exactly
  // the tools that connected servers actually expose
  const policies = {
    ...DEFAULT_POLICIES,
    allowedTools: [...DEFAULT_POLICIES.allowedTools, ...mcpTools.map((t) => t.name)],
  }
  const memoryContext = await agentMemory.contextFor(task)
  const skills = selectSkills(task)

  // planning is separated from execution — but only for multi-step tasks;
  // a plan with fewer than 2 steps carries no information
  let plan: Plan | undefined
  if (shouldPlan(task)) {
    const candidate = await makePlan(llm, task)
    if (candidate.steps.length >= 2) {
      plan = candidate
      onPlan?.(candidate)
    }
  }

  // multi-step tasks run orchestrated: one fresh executor per plan step,
  // then synthesis, with the judge gate tied to the verify-answers setting
  if (plan) {
    return runOrchestratedTask({
      llm,
      task,
      tools,
      policies,
      skills,
      memoryContext,
      plan,
      persona: settings.systemPrompt,
      judgeGate: settings.verifyAnswers,
      onStep,
    })
  }

  const result = await runAgentLoop({ llm, task, tools, policies, skills, memoryContext, persona: settings.systemPrompt, onStep })
  return { ...result, retried: false }
}

/** reflection + judge pass over a finished answer, on the loaded model */
export async function verifyAgentAnswer(
  task: string,
  answer: string,
  settings: InferenceSettings,
  isCancelled: () => boolean
): Promise<VerifiedAnswer> {
  const llm = makeCancellableLLM(engineLLM(settings), isCancelled)
  return verifyAnswer(llm, task, answer)
}
