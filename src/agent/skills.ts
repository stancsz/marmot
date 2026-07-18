import { Skill } from './types'

/**
 * A skill is not knowledge — it is "when problem X appears, execute
 * procedure Y". Skills matching the task are injected into the loop's
 * system prompt.
 */
export const DEFAULT_SKILLS: Skill[] = [
  {
    id: 'math',
    triggers: ['calculate', 'compute', 'sum', 'multiply', 'divide', 'percent', 'math', '+', '*'],
    procedure:
      'For any arithmetic, do not compute in your head — call the calculator tool and use its exact result.',
  },
  {
    id: 'recall',
    triggers: ['remember', 'last time', 'previous', 'earlier', 'we discussed', 'past chat'],
    procedure:
      'When the user refers to past conversations, call search_chats with distinctive keywords before answering.',
  },
  {
    id: 'writing',
    triggers: ['write', 'draft', 'email', 'letter', 'rewrite', 'summarize', 'summary'],
    procedure:
      'For writing tasks: state the goal in one line, produce the draft, then tighten it — cut filler, keep the user’s tone.',
  },
  {
    id: 'debugging',
    triggers: ['error', 'bug', 'crash', 'fails', 'broken', 'fix'],
    procedure:
      'For debugging: restate the symptom, list 2-3 candidate causes, pick the most likely, and give one concrete next check before proposing fixes.',
  },
]

export function selectSkills(task: string, skills: Skill[] = DEFAULT_SKILLS): Skill[] {
  const lower = task.toLowerCase()
  return skills.filter((s) => s.triggers.some((t) => lower.includes(t.toLowerCase())))
}

export function skillsPrompt(skills: Skill[]): string {
  if (skills.length === 0) return ''
  return `Active skills:\n${skills.map((s) => `- ${s.procedure}`).join('\n')}`
}
