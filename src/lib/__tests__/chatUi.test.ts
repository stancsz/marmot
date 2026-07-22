import {
  CHAT_MOTION,
  CHAT_TOUCH_TARGET,
  COMPOSER_MIN_HEIGHT,
  attachmentKind,
  composerAction,
} from '../chatUi'

describe('chat UI contract', () => {
  it('keeps interactive controls at a usable touch size', () => {
    expect(CHAT_TOUCH_TARGET).toBeGreaterThanOrEqual(44)
    expect(COMPOSER_MIN_HEIGHT).toBeGreaterThanOrEqual(44)
  })

  it('selects one deliberate composer action for each state', () => {
    expect(composerAction({ phase: 'idle', hasContent: false })).toBe('disabled')
    expect(composerAction({ phase: 'idle', hasContent: true })).toBe('send')
    expect(composerAction({ phase: 'loading-model', hasContent: true })).toBe('disabled')
    expect(composerAction({ phase: 'generating', hasContent: true })).toBe('stop')
  })

  it('uses short spring-led motion timings', () => {
    expect(CHAT_MOTION.enter).toBeLessThanOrEqual(300)
    expect(CHAT_MOTION.layout).toBeLessThanOrEqual(300)
    expect(CHAT_MOTION.pressDamping).toBeGreaterThan(0)
  })

  it('classifies attachment previews without emoji-dependent presentation', () => {
    expect(attachmentKind('image/png')).toBe('image')
    expect(attachmentKind('application/pdf')).toBe('pdf')
    expect(attachmentKind('text/plain')).toBe('file')
  })
})
