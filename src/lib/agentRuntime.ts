import AsyncStorage from '@react-native-async-storage/async-storage'
import { engine } from './engine'
import { loadChats } from './chatStore'
import { InferenceSettings } from '../types'
import {
  AgentLLM,
  AgentResult,
  AgentStep,
  MemoryStore,
  Plan,
  VerifiedAnswer,
  calculatorTool,
  datetimeTool,
  makeCancellableLLM,
  makePlan,
  runAgentLoop,
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

export const agentMemory = new MemoryStore(AsyncStorage)

export async function runAgentTask(
  task: string,
  settings: InferenceSettings,
  isCancelled: () => boolean,
  onStep: (step: AgentStep) => void,
  onPlan?: (plan: Plan) => void
): Promise<AgentResult> {
  const llm = makeCancellableLLM(engineLLM(settings), isCancelled)
  const tools = [calculatorTool(), datetimeTool(), searchChatsTool(loadChats)]
  const memoryContext = await agentMemory.contextFor(task)

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

  return runAgentLoop({
    llm,
    task,
    tools,
    skills: selectSkills(task),
    memoryContext,
    plan,
    onStep,
  })
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
