import { actionCardFor, saveActionCard } from '../actionCards'

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
})
