/** Minimum comfortable target for a primary mobile action. */
export const CHAT_TOUCH_TARGET = 44

/** Minimum composer height before text input grows with multiline content. */
export const COMPOSER_MIN_HEIGHT = 48

/** Shared motion contract for chat state and interaction transitions. */
export const CHAT_MOTION = {
  enter: 220,
  exit: 160,
  layout: 180,
  pressDamping: 18,
} as const

export type ChatPhase = 'idle' | 'loading-model' | 'generating'

export type ComposerAction = 'send' | 'stop' | 'disabled'

/**
 * Resolves the single action the composer should expose for its current state.
 * Loading is intentionally non-actionable; generation exposes Stop instead.
 */
export function composerAction(input: { phase: ChatPhase; hasContent: boolean }): ComposerAction {
  if (input.phase === 'generating') return 'stop'
  if (input.phase !== 'idle' || !input.hasContent) return 'disabled'
  return 'send'
}

export type AttachmentKind = 'image' | 'pdf' | 'file'

/** Maps a MIME type to a stable presentation category for attachment previews. */
export function attachmentKind(mimeType: string): AttachmentKind {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType === 'application/pdf') return 'pdf'
  return 'file'
}
