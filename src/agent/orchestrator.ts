import {
  AgentLLM,
  AgentPolicies,
  AgentResult,
  AgentStep,
  JudgeVerdict,
  Plan,
  Skill,
  ToolDef,
} from './types'
import { DEFAULT_POLICIES, runAgentLoop } from './loop'
import { makePlan } from './planner'
import { judge } from './reflection'

/** each per-step executor gets a small budget of its own */
const EXECUTOR_MAX_STEPS = 3

export interface OrchestratorOptions {
  llm: AgentLLM
  task: string
  tools: ToolDef[]
  policies?: AgentPolicies
  skills?: Skill[]
  memoryContext?: string
  /** precomputed plan (avoids a second planner call); made fresh if absent */
  plan?: Plan
  /** run a judge pass on the synthesized answer, with one bounded retry */
  judgeGate?: boolean
  onStep?: (step: AgentStep) => void
  onPlan?: (plan: Plan) => void
}

export interface OrchestratorResult extends AgentResult {
  verdict?: JudgeVerdict
  retried: boolean
}

interface StepSummary {
  id: number
  text: string
  answer: string
  incomplete: boolean
}

function executorTask(task: string, step: { id: number; text: string }, done: StepSummary[]): string {
  const context =
    done.length > 0
      ? `\n\nCompleted so far:\n${done
          .map((d) => `${d.id}. ${d.text} → ${d.answer}${d.incomplete ? ' (incomplete)' : ''}`)
          .join('\n')}`
      : ''
  return `Overall task: ${task}${context}\n\nYour job now is ONLY this step: ${step.text}`
}

async function synthesize(
  llm: AgentLLM,
  task: string,
  summaries: StepSummary[],
  judgeFeedback?: string
): Promise<string> {
  const results = summaries
    .map((s) => `${s.id}. ${s.text} → ${s.answer}${s.incomplete ? ' (incomplete)' : ''}`)
    .join('\n')
  const feedback = judgeFeedback
    ? `\n\nA reviewer rejected the previous answer because: ${judgeFeedback}\nFix those problems.`
    : ''
  return llm.complete([
    {
      role: 'system',
      content:
        'You are Marmot, a local assistant. Combine the step results into one clear final answer ' +
        'for the user. Respond with plain text only — no JSON.',
    },
    { role: 'user', content: `Task: ${task}\n\nStep results:\n${results}${feedback}` },
  ])
}

/**
 * Subagent orchestration: each plan step runs in a fresh executor loop with
 * its own small budget, seeing only the overall task plus completed-step
 * summaries — not the full transcript. A synthesizer combines the results,
 * and an optional judge gate rejects once and forces one improved retry.
 * Plan check-offs here are orchestrator-driven (deterministic), unlike the
 * single-loop path where the model self-reports.
 */
export async function runOrchestratedTask(opts: OrchestratorOptions): Promise<OrchestratorResult> {
  const policies = opts.policies ?? DEFAULT_POLICIES
  const steps: AgentStep[] = []
  const emit = (step: AgentStep) => {
    steps.push(step)
    opts.onStep?.(step)
  }

  let plan = opts.plan
  if (!plan) {
    plan = await makePlan(opts.llm, opts.task)
    if (plan.steps.length >= 2) opts.onPlan?.(plan)
  }

  // degenerate plan → plain single loop, no orchestration overhead
  if (!plan || plan.steps.length < 2) {
    const result = await runAgentLoop({
      llm: opts.llm,
      task: opts.task,
      tools: opts.tools,
      policies,
      skills: opts.skills,
      memoryContext: opts.memoryContext,
      onStep: opts.onStep,
    })
    return { ...result, retried: false }
  }

  const summaries: StepSummary[] = []
  let anyTruncated = false

  for (const step of plan.steps) {
    emit({ kind: 'subtask', content: step.text })
    const result = await runAgentLoop({
      llm: opts.llm,
      task: executorTask(opts.task, step, summaries),
      tools: opts.tools,
      policies: { ...policies, maxSteps: Math.min(EXECUTOR_MAX_STEPS, policies.maxSteps) },
      skills: opts.skills,
      memoryContext: opts.memoryContext,
      onStep: (s) => {
        if (s.kind !== 'final') emit(s)
      },
    })
    anyTruncated = anyTruncated || result.truncated
    summaries.push({ id: step.id, text: step.text, answer: result.answer, incomplete: result.truncated })
    emit({ kind: 'plan_check', content: String(step.id) })
  }

  let answer = (await synthesize(opts.llm, opts.task, summaries)).trim()
  let verdict: JudgeVerdict | undefined
  let retried = false

  if (opts.judgeGate) {
    verdict = await judge(opts.llm, opts.task, answer)
    if (!verdict.accept) {
      const improved = (await synthesize(opts.llm, opts.task, summaries, verdict.reasons)).trim()
      const secondVerdict = await judge(opts.llm, opts.task, improved)
      answer = improved
      verdict = secondVerdict
      retried = true
    }
  }

  emit({ kind: 'final', content: answer })
  return { answer, steps, truncated: anyTruncated, verdict, retried }
}
