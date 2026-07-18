import { AgentLLM, JudgeVerdict, Reflection } from './types'
import { extractFirstJson } from './json'

/**
 * Reflection asks "did I do well?" — the same model critiques its own
 * answer and may revise it. Cheap and effective for small models.
 */
export async function reflect(llm: AgentLLM, task: string, answer: string): Promise<Reflection> {
  const raw = await llm.complete([
    {
      role: 'system',
      content:
        'You are a strict self-reviewer. Given a task and an answer, decide if the answer is correct and complete. ' +
        'Respond with ONLY JSON: {"ok": true|false, "critique": "...", "revisedAnswer": "..." }. ' +
        'Include revisedAnswer only when ok is false and you can fix it.',
    },
    { role: 'user', content: `Task:\n${task}\n\nAnswer:\n${answer}` },
  ])
  const json = extractFirstJson(raw) as Record<string, unknown> | null
  if (!json || typeof json.ok !== 'boolean') {
    // Unparseable reflection must not sink a good answer — pass it through.
    return { ok: true, critique: 'Reflection output unparseable; keeping original answer.' }
  }
  return {
    ok: json.ok,
    critique: typeof json.critique === 'string' ? json.critique : '',
    revisedAnswer: typeof json.revisedAnswer === 'string' ? json.revisedAnswer : undefined,
  }
}

/**
 * The judge is separate from reflection: "would another expert accept
 * this?" — scored against explicit criteria, not the author's feelings.
 */
export async function judge(
  llm: AgentLLM,
  task: string,
  answer: string,
  criteria = 'correct, complete, directly addresses the task'
): Promise<JudgeVerdict> {
  const raw = await llm.complete([
    {
      role: 'system',
      content:
        `You are an independent expert judge. Criteria: ${criteria}. ` +
        'Respond with ONLY JSON: {"accept": true|false, "score": 0-10, "reasons": "..."}',
    },
    { role: 'user', content: `Task:\n${task}\n\nCandidate answer:\n${answer}` },
  ])
  const json = extractFirstJson(raw) as Record<string, unknown> | null
  if (!json || typeof json.accept !== 'boolean') {
    return { accept: false, score: 0, reasons: 'Judge output unparseable' }
  }
  const scoreNum = typeof json.score === 'number' ? json.score : Number(json.score)
  return {
    accept: json.accept,
    score: Number.isFinite(scoreNum) ? Math.max(0, Math.min(10, scoreNum)) : 0,
    reasons: typeof json.reasons === 'string' ? json.reasons : '',
  }
}
