import { verifyAnswer } from '../verify'
import { AgentLLM } from '../types'

function scriptedLLM(responses: string[]): AgentLLM {
  let i = 0
  return {
    async complete() {
      if (i >= responses.length) throw new Error('exhausted')
      return responses[i++]
    },
  }
}

describe('verifyAnswer', () => {
  it('keeps a good answer and attaches the judge verdict', async () => {
    const llm = scriptedLLM([
      '{"ok": true, "critique": "correct"}',
      '{"accept": true, "score": 9, "reasons": "checks out"}',
    ])
    const v = await verifyAnswer(llm, 'task', 'original')
    expect(v.answer).toBe('original')
    expect(v.revised).toBe(false)
    expect(v.verdict.accept).toBe(true)
    expect(v.verdict.score).toBe(9)
  })

  it('adopts the reflection revision and judges the revised answer', async () => {
    const seen: string[] = []
    let i = 0
    const responses = [
      '{"ok": false, "critique": "sum is wrong", "revisedAnswer": "the sum is 5"}',
      '{"accept": true, "score": 8, "reasons": "now correct"}',
    ]
    const llm: AgentLLM = {
      async complete(messages) {
        seen.push(messages[messages.length - 1].content)
        return responses[i++]
      },
    }
    const v = await verifyAnswer(llm, 'add 2+3', 'the sum is 4')
    expect(v.answer).toBe('the sum is 5')
    expect(v.revised).toBe(true)
    expect(seen[1]).toContain('the sum is 5') // judge saw the revision, not the original
  })

  it('surfaces a judge rejection without altering the answer', async () => {
    const llm = scriptedLLM([
      '{"ok": true, "critique": "fine"}',
      '{"accept": false, "score": 3, "reasons": "misses half the task"}',
    ])
    const v = await verifyAnswer(llm, 'task', 'weak answer')
    expect(v.answer).toBe('weak answer')
    expect(v.verdict.accept).toBe(false)
    expect(v.verdict.score).toBe(3)
  })

  it('ignores an empty revision string', async () => {
    const llm = scriptedLLM([
      '{"ok": false, "critique": "meh", "revisedAnswer": "   "}',
      '{"accept": true, "score": 6, "reasons": "ok"}',
    ])
    const v = await verifyAnswer(llm, 'task', 'original')
    expect(v.answer).toBe('original')
    expect(v.revised).toBe(false)
  })
})
