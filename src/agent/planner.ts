import { AgentLLM, Plan, PlanStep } from './types'
import { extractFirstJson } from './json'

/**
 * Planning separated from execution: ask the model for a short numbered
 * plan, parse it into steps the loop (and the UI) can track.
 */
export async function makePlan(llm: AgentLLM, task: string): Promise<Plan> {
  const text = await llm.complete([
    {
      role: 'system',
      content:
        'You are a planner. Break the task into 2-5 short concrete steps. ' +
        'Respond with ONLY a JSON object: {"steps": ["step one", "step two", ...]}',
    },
    { role: 'user', content: task },
  ])
  return parsePlan(text)
}

export function parsePlan(text: string): Plan {
  // preferred: {"steps": [...]}
  const json = extractFirstJson(text) as { steps?: unknown } | null
  if (json && Array.isArray(json.steps)) {
    const steps = json.steps
      .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      .map((s, i): PlanStep => ({ id: i + 1, text: s.trim(), done: false }))
    if (steps.length > 0) return { steps }
  }
  // fallback: numbered or bulleted lines
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .map((l) => l.match(/^(?:\d+[.)]\s*|[-*]\s+)(.+)$/)?.[1])
    .filter((l): l is string => !!l && l.length > 0)
  if (lines.length > 0) {
    return { steps: lines.map((textLine, i) => ({ id: i + 1, text: textLine, done: false })) }
  }
  // last resort: the whole task as one step
  const single = text.trim()
  return { steps: single ? [{ id: 1, text: single.slice(0, 200), done: false }] : [] }
}

export function markDone(plan: Plan, stepId: number): Plan {
  return { steps: plan.steps.map((s) => (s.id === stepId ? { ...s, done: true } : s)) }
}

/**
 * Planning costs a full LLM round trip on a phone — only plan when the task
 * is plausibly multi-step. Deliberately simple and pinned by tests.
 */
export function shouldPlan(task: string): boolean {
  const t = task.trim()
  if (t.length > 120) return true
  const sentences = t.split(/[.!?]\s/).filter((s) => s.trim().length > 0)
  if (sentences.length > 1) return true
  return /\b(and then|then|and also|after that|first|finally)\b/i.test(t)
}
