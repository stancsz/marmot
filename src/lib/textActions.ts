/**
 * Quick text actions — one-tap transforms for shared or pasted text
 * (Apple-Intelligence-style writing tools). Pure prompt builders, tested;
 * the Ingest screen runs them through the engine.
 */

export interface TextAction {
  id: string
  label: string
  emoji: string
  buildPrompt: (text: string, option?: string) => string
  /** options rendered as sub-chips (e.g. target languages, tones) */
  options?: string[]
}

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

export const TEXT_ACTIONS: TextAction[] = [
  {
    id: 'summarize',
    label: 'Summarize',
    emoji: '📝',
    buildPrompt: (text) =>
      wrap('Summarize the following in 3-5 sentences. Keep the key facts and numbers.', text),
  },
  {
    id: 'key_points',
    label: 'Key points',
    emoji: '🔑',
    buildPrompt: (text) =>
      wrap('Extract the key points from the following as a short markdown bullet list.', text),
  },
  {
    id: 'proofread',
    label: 'Proofread',
    emoji: '✏️',
    buildPrompt: (text) =>
      wrap(
        'Proofread the following. Fix grammar, spelling, and clarity while keeping the author’s voice. Return the corrected text, then a one-line note of what changed.',
        text
      ),
  },
  {
    id: 'translate',
    label: 'Translate',
    emoji: '🌍',
    options: ['English', 'French', 'Spanish', 'German', 'Chinese', 'Japanese'],
    buildPrompt: (text, target = 'English') =>
      wrap(`Translate the following into ${target}. Return only the translation.`, text),
  },
  {
    id: 'tone',
    label: 'Change tone',
    emoji: '🎚️',
    options: ['professional', 'friendly', 'concise', 'persuasive'],
    buildPrompt: (text, tone = 'professional') =>
      wrap(`Rewrite the following in a ${tone} tone. Keep the meaning intact.`, text),
  },
  {
    id: 'reply',
    label: 'Draft reply',
    emoji: '↩️',
    buildPrompt: (text) =>
      wrap('Draft a brief, polite reply to the following message. Offer one clarifying question if something is ambiguous.', text),
  },
  {
    id: 'explain',
    label: 'Explain',
    emoji: '💡',
    buildPrompt: (text) =>
      wrap('Explain the following in plain language, as if to a smart friend outside the field.', text),
  },
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
