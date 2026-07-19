import { splitThinking } from '../thinking'

describe('splitThinking', () => {
  it('splits explicit <think> blocks (existing behavior)', () => {
    const r = splitThinking('<think>reasoning</think>answer here')
    expect(r).toEqual({ thinking: 'reasoning', answer: 'answer here', isThinking: false })
  })

  it('handles closing-tag-only streams (Qwen3.5 template, found in E2E)', () => {
    const r = splitThinking('Okay, final decision: "Paris." </think>\n\nParis.')
    expect(r.thinking).toContain('final decision')
    expect(r.answer).toBe('Paris.')
    expect(r.isThinking).toBe(false)
  })

  it('flags implicit still-open reasoning streams while streaming', () => {
    const r = splitThinking('Thinking Process:\n1. Analyze the request')
    expect(r.isThinking).toBe(true)
    expect(r.answer).toBe('')
  })

  it('never hides normal answers', () => {
    const r = splitThinking('Paris is the capital of France.')
    expect(r.answer).toBe('Paris is the capital of France.')
    expect(r.isThinking).toBe(false)
  })
})
