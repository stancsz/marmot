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

export function actionCardFor(actionId: string, content: string, option?: string): ActionCard {
  const meta = ACTION_CARD_META[actionId] ?? { kind: 'explanation', title: 'Generated result' }
  return {
    kind: meta.kind,
    title: meta.title,
    sourceAction: actionId,
    content,
    // A draft is never sent from Quick actions, but still deserves an explicit
    // review boundary so the UI cannot imply that a message was sent.
    requiresApproval: meta.kind === 'draft_reply',
    status: 'preview',
    option,
  }
}

export function saveActionCard(content: string): ActionCard {
  return {
    kind: 'save_document',
    title: 'Save to documents',
    sourceAction: 'save_document',
    content,
    requiresApproval: true,
    status: 'preview',
  }
}
