import { splitThinking, visibleAnswer } from '../thinking'

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

  it('catches markdown-decorated reasoning openers (found in E2E)', () => {
    expect(splitThinking('**Thinking Process:**\n1. Analyze').isThinking).toBe(true)
    expect(splitThinking('### Thinking Process\n- Task').isThinking).toBe(true)
  })

  it('never hides normal answers', () => {
    const r = splitThinking('Paris is the capital of France.')
    expect(r.answer).toBe('Paris is the capital of France.')
    expect(r.isThinking).toBe(false)
  })
})

describe('visibleAnswer', () => {
  it('strips reasoning for one-shot consumers (voice, quick actions, agent)', () => {
    expect(visibleAnswer('<think>hmm</think>The answer.')).toBe('The answer.')
    expect(visibleAnswer('Okay, deciding. </think>\nParis.')).toBe('Paris.')
  })

  it('falls back to raw text when the model only produced reasoning', () => {
    const allThinking = 'Thinking Process:\n1. Analyze the request'
    expect(visibleAnswer(allThinking)).toBe(allThinking)
  })

  it('passes plain answers through untouched', () => {
    expect(visibleAnswer('  Plain answer.  ')).toBe('Plain answer.')
  })
})
