import { AgentLLM, JudgeVerdict, Reflection } from './types'
import { judge, reflect } from './reflection'

export interface VerifiedAnswer {
  /** the answer to show — reflection's revision if it produced one */
  answer: string
  revised: boolean
  reflection: Reflection
  verdict: JudgeVerdict
}

/**
 * Verification pass: Reflection ("did I do well?") may revise the answer;
 * the Judge ("would another expert accept this?") then scores whatever
 * survives. Two extra LLM round trips — gated behind a setting.
 */
export async function verifyAnswer(
  llm: AgentLLM,
  task: string,
  answer: string
): Promise<VerifiedAnswer> {
  const reflection = await reflect(llm, task, answer)
  const candidate =
    !reflection.ok && reflection.revisedAnswer?.trim() ? reflection.revisedAnswer.trim() : answer
  const verdict = await judge(llm, task, candidate)
  return {
    answer: candidate,
    revised: candidate !== answer,
    reflection,
    verdict,
  }
}
