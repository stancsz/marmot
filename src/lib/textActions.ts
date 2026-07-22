/**
 * Quick text actions — one-tap transforms for shared or pasted text
 * (Apple-Intelligence-style writing tools). Pure prompt builders, tested;
 * the Ingest screen runs them through the engine.
 */

export interface TextAction {
  id: string
  label: string
  /** Semantic icon key rendered by the native icon system. */
  icon: 'summarize' | 'keyPoints' | 'proofread' | 'translate' | 'tone' | 'reply' | 'explain' | 'privacy' | 'observation' | 'subtask'
  group: TextActionGroup
  buildPrompt: (text: string, option?: string) => string
  /** Deterministic on-device transform that does not need a model. */
  runLocally?: (text: string) => string
  /** options rendered as sub-chips (e.g. target languages, tones) */
  options?: string[]
}

export type TextActionGroup = 'Understand' | 'Write' | 'Plan' | 'Protect'

/** keep prompts inside small-model context windows */
export const MAX_ACTION_INPUT_CHARS = 6000

export function clipInput(text: string): string {
  const clean = text.trim()
  return clean.length > MAX_ACTION_INPUT_CHARS
    ? `${clean.slice(0, MAX_ACTION_INPUT_CHARS)}…[input truncated]`
    : clean
}

const wrap = (instruction: string, text: string) =>
  `${instruction}\n\n---\n${clipInput(text)}\n---`

/**
 * Redact common, machine-detectable identifiers without sending the source to
 * a model. This is intentionally conservative: names, addresses, and
 * arbitrary identifiers need a reviewable extraction feature later.
 */
export function redactPii(text: string): string {
  const rules: Array<[RegExp, string]> = [
    [/\b(?:https?:\/\/|www\.)[^\s<]+/gi, '[URL redacted]'],
    [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email redacted]'],
    [/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN redacted]'],
    [/\b(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}\b/g, '[phone redacted]'],
    [/\b(?:\d[ -]?){13,19}\b/g, '[card redacted]'],
  ]
  return rules.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text)
}

export const TEXT_ACTIONS: TextAction[] = [
  {
    id: 'summarize',
    label: 'Summarize',
    icon: 'summarize',
    group: 'Understand',
    buildPrompt: (text) =>
      wrap('Summarize the following in 3-5 sentences. Keep the key facts and numbers.', text),
  },
  {
    id: 'action_items',
    label: 'Action items',
    icon: 'keyPoints',
    group: 'Plan',
    buildPrompt: (text) =>
      wrap('Extract concrete action items from the following as a short markdown bullet list. Include the owner or deadline only when stated. If there are none, say so.', text),
  },
  {
    id: 'pii_eraser',
    label: 'PII eraser',
    icon: 'privacy',
    group: 'Protect',
    buildPrompt: (text) =>
      wrap('Redact obvious email addresses, phone numbers, URLs, card numbers, and SSN-like values. Return only the redacted text.', text),
    runLocally: (text: string) => redactPii(text),
  },
  {
    id: 'proofread',
    label: 'Proofread',
    icon: 'proofread',
    group: 'Write',
    buildPrompt: (text) =>
      wrap(
        'Proofread the following. Fix grammar, spelling, and clarity while keeping the author’s voice. Return the corrected text, then a one-line note of what changed.',
        text
      ),
  },
  {
    id: 'translate',
    label: 'Translate',
    icon: 'translate',
    group: 'Write',
    options: ['English', 'French', 'Spanish', 'German', 'Chinese', 'Japanese'],
    buildPrompt: (text, target = 'English') =>
      wrap(`Translate the following into ${target}. Return only the translation.`, text),
  },
  {
    id: 'tone',
    label: 'Change tone',
    icon: 'tone',
    group: 'Write',
    options: ['professional', 'friendly', 'concise', 'persuasive'],
    buildPrompt: (text, tone = 'professional') =>
      wrap(`Rewrite the following in a ${tone} tone. Keep the meaning intact.`, text),
  },
  {
    id: 'reply',
    label: 'Draft reply',
    icon: 'reply',
    group: 'Write',
    buildPrompt: (text) =>
      wrap(
        [
          'You are drafting a reply on behalf of the user.',
          'Reply to the specific request in the message below in 1-3 short sentences.',
          'Be polite, concrete, and reference the actual ask, including people, times, and dates when present.',
          'Ask at most one short clarifying question, and only if the message is genuinely ambiguous; never ask the user to describe their own problem.',
          'Do not refuse. Do not say "I can help" or "happy to help". Do not add a generic greeting.',
          'Return only the reply text: no preamble, labels, separators, or markdown.',
        ].join(' '),
        text
      ),
  },
  {
    id: 'explain',
    label: 'Explain',
    icon: 'explain',
    group: 'Understand',
    buildPrompt: (text) =>
      wrap('Explain the following in plain language, as if to a smart friend outside the field.', text),
  },
  {
    id: 'key_facts',
    label: 'Key facts',
    icon: 'keyPoints',
    group: 'Understand',
    buildPrompt: (text) =>
      wrap('Extract the essential facts, names, dates, numbers, and decisions from the following as a concise markdown list. Do not invent missing details.', text),
  },
  {
    id: 'compare',
    label: 'Compare',
    icon: 'observation',
    group: 'Understand',
    buildPrompt: (text) =>
      wrap('Compare the options or viewpoints in the following. Use a compact table or bullets, and finish with the main tradeoff. Do not choose for me unless asked.', text),
  },
  {
    id: 'shorten',
    label: 'Shorten',
    icon: 'tone',
    group: 'Write',
    buildPrompt: (text) =>
      wrap('Shorten the following by about half while keeping the meaning, important facts, and the authorâ€™s voice. Return only the revised text.', text),
  },
  {
    id: 'checklist',
    label: 'Checklist',
    icon: 'keyPoints',
    group: 'Plan',
    buildPrompt: (text) =>
      wrap('Turn the following into a practical markdown checklist. Keep only concrete tasks and preserve any stated owner or deadline.', text),
  },
  {
    id: 'next_steps',
    label: 'Next steps',
    icon: 'subtask',
    group: 'Plan',
    buildPrompt: (text) =>
      wrap('Turn the following into the smallest useful ordered next steps. Flag missing information as a question instead of guessing.', text),
  },
  {
    id: 'meeting_notes',
    label: 'Meeting notes',
    icon: 'keyPoints',
    group: 'Plan',
    buildPrompt: (text) =>
      wrap('Convert the following into concise meeting notes with decisions, open questions, action items, owners, and deadlines only when stated.', text),
  },
]

/** Intent groups keep the larger catalog scannable on a small screen. */
export const TEXT_ACTION_GROUPS: ReadonlyArray<{ label: TextActionGroup; actions: TextAction[] }> = [
  { label: 'Understand', actions: TEXT_ACTIONS.filter((action) => action.group === 'Understand') },
  { label: 'Write', actions: TEXT_ACTIONS.filter((action) => action.group === 'Write') },
  { label: 'Plan', actions: TEXT_ACTIONS.filter((action) => action.group === 'Plan') },
  { label: 'Protect', actions: TEXT_ACTIONS.filter((action) => action.group === 'Protect') },
]

export function getTextAction(id: string): TextAction | undefined {
  return TEXT_ACTIONS.find((a) => a.id === id)
}

/** deep-research directive — steers the orchestrator into a cited multi-source run */
export function buildResearchTask(question: string): string {
  return (
    `Research this thoroughly: ${question.trim()}\n` +
    'Plan at least 3 distinct web_search queries covering different angles, ' +
    'fetch_page the most relevant result for each, cross-check the findings, ' +
    'and finish with a clear answer followed by a "Sources:" list of the URLs you used.'
  )
}
