import AsyncStorage from '@react-native-async-storage/async-storage'
import { engine } from './engine'
import { loadChats } from './chatStore'
import { InferenceSettings } from '../types'
import {
  AgentLLM,
  AgentStep,
  MemoryStore,
  OrchestratorResult,
  Plan,
  VerifiedAnswer,
  calculatorTool,
  datetimeTool,
  makeCancellableLLM,
  makePlan,
  runAgentLoop,
  runOrchestratedTask,
  searchChatsTool,
  selectSkills,
  shouldPlan,
  verifyAnswer,
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

export const agentMemory = new MemoryStore(AsyncStorage, undefined, engineEmbedder)

export async function runAgentTask(
  task: string,
  settings: InferenceSettings,
  isCancelled: () => boolean,
  onStep: (step: AgentStep) => void,
  onPlan?: (plan: Plan) => void
): Promise<OrchestratorResult> {
  const llm = makeCancellableLLM(engineLLM(settings), isCancelled)
  const tools = [calculatorTool(), datetimeTool(), searchChatsTool(loadChats)]
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
      skills,
      memoryContext,
      plan,
      judgeGate: settings.verifyAnswers,
      onStep,
    })
  }

  const result = await runAgentLoop({ llm, task, tools, skills, memoryContext, onStep })
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
