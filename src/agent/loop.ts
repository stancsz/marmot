import {
  AgentAction,
  AgentLLM,
  AgentPolicies,
  AgentResult,
  AgentStep,
  LLMMessage,
  Plan,
  Skill,
  ToolDef,
} from './types'
import { extractFirstJson } from './json'
import { skillsPrompt } from './skills'

export const DEFAULT_POLICIES: AgentPolicies = {
  maxSteps: 6,
  allowedTools: ['calculator', 'datetime', 'search_chats', 'search_documents', 'web_search', 'fetch_page'],
  maxObservationChars: 2000,
}

interface LoopOptions {
  llm: AgentLLM
  task: string
  tools: ToolDef[]
  policies?: AgentPolicies
  skills?: Skill[]
  memoryContext?: string
  plan?: Plan
  /** persona/system prompt from settings — how to speak and act */
  persona?: string
  onStep?: (step: AgentStep) => void
  /**
   * Per-tier max tokens for each agent turn. When set, overrides
   * whatever maxTokens the LLM was initialised with for this loop only.
   * Drives the tiered budget system (quick=256, tool=512, research=768).
   */
  tokenBudget?: number
  /**
   * When provided, only tools whose names appear in this list are injected
   * into the system prompt. Keeps the context lean for simple tasks.
   * An empty array means no tools (direct-answer mode).
   */
  toolFilter?: ReadonlyArray<string>
}

function planPrompt(plan?: Plan): string {
  if (!plan || plan.steps.length === 0) return ''
  const lines = plan.steps.map((s) => `${s.id}. ${s.text}`).join('\n')
  return (
    `Your plan:\n${lines}\n` +
    'When you have completed a plan step, include "done_step": <step number> in that turn’s JSON.'
  )
}

function systemPrompt(
  tools: ToolDef[],
  policies: AgentPolicies,
  skills: Skill[],
  memoryContext: string,
  plan?: Plan,
  persona?: string,
  toolFilter?: ReadonlyArray<string>
): string {
  // Narrow to policy-allowed tools, then further to the tier's tool filter
  // (if provided). An empty toolFilter means no tools — direct-answer mode.
  let usable = tools.filter((t) => policies.allowedTools.includes(t.name))
  if (toolFilter !== undefined) {
    usable = usable.filter((t) => toolFilter.includes(t.name))
  }
  const toolLines = usable
    .map((t) => `- ${t.name}: ${t.description} args: ${JSON.stringify(t.args)}`)
    .join('\n')
  return [
    `You are Marmot, a local agent running fully on the user's phone.`,
    persona ? `Persona (how to speak and act in your final answer): ${persona}` : '',
    'Work step by step: observe, decide, act, verify.',
    'On each turn respond with ONLY one JSON object, nothing else:',
    '  {"thought": "...", "action": "tool", "tool": "<name>", "args": {...}}',
    '  {"thought": "...", "action": "final", "answer": "..."}',
    usable.length > 0 ? `Tools available:\n${toolLines}` : 'No tools are available — answer directly.',
    `You have at most ${policies.maxSteps} turns; be economical.`,
    planPrompt(plan),
    skillsPrompt(skills),
    memoryContext,
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function parseAction(text: string): AgentAction | null {
  const json = extractFirstJson(text) as Record<string, unknown> | null
  if (!json) return null
  const doneStep = num(json.done_step ?? json.doneStep)
  if (json.action === 'final' && typeof json.answer === 'string') {
    return { action: 'final', answer: json.answer, thought: str(json.thought), doneStep }
  }
  if (json.action === 'tool' && typeof json.tool === 'string') {
    const args = (json.args && typeof json.args === 'object' ? json.args : {}) as Record<string, unknown>
    return { action: 'tool', tool: json.tool, args, thought: str(json.thought), doneStep }
  }
  return null
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : undefined
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

/**
 * The execution loop: Observe → Decide → Act → Verify → repeat, bounded by
 * policies. Malformed model output and disallowed tools become observations
 * (failure is evidence), not crashes.
 */
export async function runAgentLoop(opts: LoopOptions): Promise<AgentResult> {
  const policies = opts.policies ?? DEFAULT_POLICIES
  const skills = opts.skills ?? []
  const steps: AgentStep[] = []
  const emit = (step: AgentStep) => {
    steps.push(step)
    opts.onStep?.(step)
  }

  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: systemPrompt(
        opts.tools,
        policies,
        skills,
        opts.memoryContext ?? '',
        opts.plan,
        opts.persona,
        opts.toolFilter
      ),
    },
    { role: 'user', content: opts.task },
  ]

  for (let i = 0; i < policies.maxSteps; i++) {
    const raw = await opts.llm.complete(messages)
    messages.push({ role: 'assistant', content: raw })

    const action = parseAction(raw)
    if (!action) {
      // Unparseable output: on the last step treat the raw text as the
      // answer rather than losing it; otherwise ask for the format again.
      if (i === policies.maxSteps - 1) {
        emit({ kind: 'final', content: raw.trim() })
        return { answer: raw.trim(), steps, truncated: false }
      }
      emit({ kind: 'error', content: 'Unparseable response; requesting JSON format again' })
      messages.push({
        role: 'user',
        content: 'Respond with ONLY the JSON object format described in the system prompt.',
      })
      continue
    }

    if (action.thought) emit({ kind: 'thought', content: action.thought })
    if (action.doneStep !== undefined && opts.plan?.steps.some((s) => s.id === action.doneStep)) {
      emit({ kind: 'plan_check', content: String(action.doneStep) })
    }

    if (action.action === 'final') {
      emit({ kind: 'final', content: action.answer })
      return { answer: action.answer, steps, truncated: false }
    }

    // tool call
    emit({ kind: 'tool_call', content: JSON.stringify(action.args), tool: action.tool })
    let observation: string
    const tool = opts.tools.find((t) => t.name === action.tool)
    if (!tool || !policies.allowedTools.includes(action.tool)) {
      observation = `Error: tool "${action.tool}" is not available.`
    } else {
      try {
        observation = String(await tool.run(action.args))
      } catch (e: any) {
        observation = `Error: ${e?.message ?? 'tool failed'}`
      }
    }
    if (observation.length > policies.maxObservationChars) {
      observation = observation.slice(0, policies.maxObservationChars) + '…[truncated]'
    }
    emit({ kind: 'observation', content: observation, tool: action.tool })
    messages.push({ role: 'user', content: `Observation: ${observation}` })
  }

  // out of steps — surface the best we have instead of pretending success
  const answer = 'I ran out of steps before finishing. Here is what I found:\n' +
    steps
      .filter((s) => s.kind === 'observation')
      .map((s) => `- ${s.content}`)
      .join('\n')
  emit({ kind: 'error', content: 'Step budget exhausted' })
  return { answer, steps, truncated: true }
}
