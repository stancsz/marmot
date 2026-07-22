import {
  actionCardFor,
  fallbackDraftReply,
  isUnusableDraftReply,
  saveActionCard,
} from '../actionCards'

describe('typed share action cards', () => {
  it('maps a draft reply to an explicit not-sent preview', () => {
    const card = actionCardFor('reply', 'A short draft')
    expect(card.kind).toBe('draft_reply')
    expect(card.requiresApproval).toBe(true)
    expect(card.status).toBe('preview')
  })

  it('models saving as a preview that needs approval', () => {
    const card = saveActionCard('Shared notes')
    expect(card.kind).toBe('save_document')
    expect(card.requiresApproval).toBe(true)
    expect(card.status).toBe('preview')
  })

  it('keeps an OCR quality warning on a save preview', () => {
    const card = saveActionCard('Total $14.25', 'Review the short local OCR result before saving.')
    expect(card.qualityWarning).toMatch(/short local OCR/i)
    expect(card.requiresApproval).toBe(true)
  })

  it('flags helper and refusal templates instead of treating them as drafts', () => {
    expect(isUnusableDraftReply("Sure, but I'd be happy to help you figure out the answer.")).toBe(true)
    expect(isUnusableDraftReply('What is the problem you are facing?')).toBe(true)
    expect(isUnusableDraftReply("I'm sorry, but I cannot help with that.")).toBe(true)
    expect(isUnusableDraftReply('ok.')).toBe(true)
    expect(isUnusableDraftReply('This is a long draft. '.repeat(30))).toBe(true)
  })

  it('accepts a concrete draft and preserves it verbatim', () => {
    const good = 'Moving it to 2 PM tomorrow works for me. I will update the invite.'
    expect(isUnusableDraftReply(good)).toBe(false)
    expect(actionCardFor('reply', good).content).toBe(good)
  })

  it('uses a reviewable fallback for an unusable model draft', () => {
    const sourceText = 'Could we move our 10 AM team sync to 2 PM tomorrow? I have a conflict.'
    const card = actionCardFor(
      'reply',
      "Sure, but I'd be happy to help you figure out the answer.\n---\nWhat is the problem you're facing?",
      undefined,
      { sourceText }
    )
    expect(card.kind).toBe('draft_reply')
    expect(card.content).toBe(fallbackDraftReply(sourceText))
    expect(card.content).toContain('2 PM tomorrow')
    expect(card.qualityWarning).toMatch(/unclear draft/i)
    expect(card.requiresApproval).toBe(true)
    expect(card.status).toBe('preview')
  })
})
