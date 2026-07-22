import { chatPreview } from '../chatPreview'

describe('chat history previews', () => {
  it('renders markdown as compact readable text', () => {
    expect(chatPreview('## **Answer**\n\nThe `capital` is [Paris](https://example.com).')).toBe(
      'Answer The capital is Paris.'
    )
  })

  it('removes list markers and reasoning tags without exposing markdown syntax', () => {
    const preview = chatPreview('<think>private reasoning</think>\n1. **Task:** Say hello\n2. *Keep it short*')
    expect(preview).toBe('Task: Say hello Keep it short')
    expect(preview).not.toMatch(/[*_`#[\]]/)
  })

  it('hides assistant-only reasoning scaffolding from history cards', () => {
    expect(chatPreview('Thinking Process:\n1. **Analyze the Request:**\n2. **Task:** Write a story', 140, 'assistant')).toBe(
      ''
    )
    expect(chatPreview('The user is asking for a greeting.', 140, 'user')).toBe(
      'The user is asking for a greeting.'
    )
  })

  it('truncates at a word boundary and adds a single ellipsis', () => {
    const preview = chatPreview('One two three four five six seven eight nine ten', 24)
    expect(preview.length).toBeLessThanOrEqual(24)
    expect(preview.endsWith('…')).toBe(true)
    expect(preview).not.toMatch(/\s…$/)
  })
})
