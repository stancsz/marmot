export type ActionCardKind =
  | 'summary'
  | 'key_points'
  | 'proofread'
  | 'translation'
  | 'tone'
  | 'draft_reply'
  | 'explanation'
  | 'save_document'
  | 'calendar_event'

export type ActionCardStatus = 'preview' | 'approved' | 'discarded'

export interface CalendarActionPayload {
  title: string
  notes: string
  startDate: Date
  endDate: Date
  eventId?: string
  undone?: boolean
}

export interface ActionCard {
  kind: ActionCardKind
  title: string
  sourceAction: string
  content: string
  qualityWarning?: string
  requiresApproval: boolean
  status: 'preview' | 'approved' | 'discarded'
  option?: string
  phoneAction?: CalendarActionPayload
}

const ACTION_CARD_META: Record<string, { kind: Exclude<ActionCardKind, 'save_document'>; title: string }> = {
  summarize: { kind: 'summary', title: 'Summary' },
  action_items: { kind: 'key_points', title: 'Action items' },
  // Keep imported/older cards readable if they were created before the label
  // was clarified for the productivity workflow.
  key_points: { kind: 'key_points', title: 'Key points' },
  proofread: { kind: 'proofread', title: 'Proofread text' },
  translate: { kind: 'translation', title: 'Translation' },
  tone: { kind: 'tone', title: 'Tone rewrite' },
  reply: { kind: 'draft_reply', title: 'Draft reply' },
  explain: { kind: 'explanation', title: 'Explanation' },
  key_facts: { kind: 'key_points', title: 'Key facts' },
  compare: { kind: 'key_points', title: 'Comparison' },
  shorten: { kind: 'summary', title: 'Shortened text' },
  checklist: { kind: 'key_points', title: 'Checklist' },
  next_steps: { kind: 'key_points', title: 'Next steps' },
  meeting_notes: { kind: 'key_points', title: 'Meeting notes' },
  pii_eraser: { kind: 'summary', title: 'PII removed' },
}

export const MIN_DRAFT_REPLY_CHARS = 24
export const MAX_DRAFT_REPLY_CHARS = 480

const DRAFT_REPLY_BAD_OPENERS: RegExp[] = [
  /^\s*i(?:'m| am)\s+sorry,?\s+but\s+i\s+cannot/i,
  /^\s*i(?:'d| would)\s+be\s+happy\s+to\s+help/i,
  /^\s*i\s+can\s+help\s+(?:you|figure)/i,
  /^\s*what(?:'s| is)\s+the\s+problem/i,
  /^\s*how\s+can\s+i\s+help/i,
  /^\s*as\s+an?\s+ai/i,
]

/** Detects common helper/refusal templates from small local models. */
export function isUnusableDraftReply(content: string): boolean {
  const trimmed = content.trim()
  if (trimmed.length < MIN_DRAFT_REPLY_CHARS) return true
  if (trimmed.length > MAX_DRAFT_REPLY_CHARS) return true
  if (/---/.test(trimmed)) return true
  const sentenceCount = (trimmed.match(/[.!?](?=\s|$)/g) ?? []).length
  if (sentenceCount > 3) return true
  const head = trimmed.slice(0, 120)
  return (
    DRAFT_REPLY_BAD_OPENERS.some((pattern) => pattern.test(head)) ||
    /\b(?:happy to help|figure out the answer)\b/i.test(trimmed)
  )
}

/** Safe local fallback when the model did not produce a grounded reply. */
export function fallbackDraftReply(sourceText = ''): string {
  const schedulingTarget = sourceText.match(
    /\b(?:move|shift|reschedule)\b[\s\S]{0,160}?\bto\s+((?:\d{1,2}(?::\d{2})?\s*(?:AM|PM))(?:\s+(?:today|tomorrow|this\s+\w+|next\s+\w+))?)/i
  )?.[1]
  if (schedulingTarget) {
    return `Thanks for letting me know. I will check whether ${schedulingTarget} works for the team and get back to you.`
  }
  return 'Thanks for the message. I will review the details and get back to you shortly.'
}

export function actionCardFor(
  actionId: string,
  content: string,
  option?: string,
  options?: { sourceText?: string }
): ActionCard {
  const meta = ACTION_CARD_META[actionId] ?? { kind: 'explanation', title: 'Generated result' }
  const unusableDraft = meta.kind === 'draft_reply' && isUnusableDraftReply(content)
  return {
    kind: meta.kind,
    title: meta.title,
    sourceAction: actionId,
    content: unusableDraft ? fallbackDraftReply(options?.sourceText) : content,
    ...(unusableDraft
      ? { qualityWarning: 'The local model returned an unclear draft. Review and edit it before approving.' }
      : {}),
    // A draft is never sent from Quick actions, but still deserves an explicit
    // review boundary so the UI cannot imply that a message was sent.
    requiresApproval: meta.kind === 'draft_reply',
    status: 'preview',
    option,
  }
}

export function saveActionCard(content: string, qualityWarning?: string): ActionCard {
  return {
    kind: 'save_document',
    title: 'Save to documents',
    sourceAction: 'save_document',
    content,
    ...(qualityWarning ? { qualityWarning } : {}),
    requiresApproval: true,
    status: 'preview',
  }
}
