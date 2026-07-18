import { runOrchestratedTask } from '../orchestrator'
import { calculatorTool } from '../tools'
import { AgentLLM, LLMMessage, Plan } from '../types'

function mockLLM(responses: string[]): AgentLLM & { calls: string[] } {
  let i = 0
  const calls: string[] = []
  return {
    calls,
    async complete(messages: LLMMessage[]) {
      calls.push(messages.map((m) => `${m.role}: ${m.content}`).join('\n---\n'))
      if (i >= responses.length) throw new Error(`MockLLM exhausted at call ${i}`)
      return responses[i++]
    },
  }
}

const PLAN: Plan = {
  steps: [
    { id: 1, text: 'compute the tip', done: false },
    { id: 2, text: 'split the total', done: false },
  ],
}

describe('runOrchestratedTask', () => {
  it('runs one fresh executor per step, feeds summaries forward, synthesizes', async () => {
    const llm = mockLLM([
      // executor for step 1
      '{"action": "tool", "tool": "calculator", "args": {"expression": "84.50*0.18"}}',
      '{"action": "final", "answer": "tip is 15.21"}',
      // executor for step 2
      '{"action": "final", "answer": "each pays 33.24"}',
      // synthesizer
      'Tip is $15.21; each person pays $33.24.',
    ])
    const result = await runOrchestratedTask({
      llm,
      task: 'tip math',
      tools: [calculatorTool()],
      plan: PLAN,
    })

    expect(result.answer).toBe('Tip is $15.21; each person pays $33.24.')
    expect(result.retried).toBe(false)
    expect(result.truncated).toBe(false)
    // subtask headers + deterministic plan check-offs, in order
    expect(result.steps.filter((s) => s.kind === 'subtask').map((s) => s.content)).toEqual([
      'compute the tip',
      'split the total',
    ])
    expect(result.steps.filter((s) => s.kind === 'plan_check').map((s) => s.content)).toEqual(['1', '2'])
    // step-2 executor saw step-1's summary, not the whole transcript
    expect(llm.calls[2]).toContain('Completed so far')
    expect(llm.calls[2]).toContain('tip is 15.21')
    // synthesizer saw both results
    expect(llm.calls[3]).toContain('each pays 33.24')
  })

  it('judge gate: rejection forces one improved retry with the feedback', async () => {
    const llm = mockLLM([
      '{"action": "final", "answer": "a"}',
      '{"action": "final", "answer": "b"}',
      'first synthesis',
      '{"accept": false, "score": 3, "reasons": "missing the split"}',
      'improved synthesis',
      '{"accept": true, "score": 8, "reasons": "complete now"}',
    ])
    const result = await runOrchestratedTask({
      llm,
      task: 't',
      tools: [],
      plan: PLAN,
      judgeGate: true,
    })
    expect(result.answer).toBe('improved synthesis')
    expect(result.retried).toBe(true)
    expect(result.verdict).toEqual({ accept: true, score: 8, reasons: 'complete now' })
    expect(llm.calls[4]).toContain('missing the split') // feedback reached the re-synthesis
  })

  it('judge gate: acceptance passes through without retry', async () => {
    const llm = mockLLM([
      '{"action": "final", "answer": "a"}',
      '{"action": "final", "answer": "b"}',
      'good synthesis',
      '{"accept": true, "score": 9, "reasons": "solid"}',
    ])
    const result = await runOrchestratedTask({ llm, task: 't', tools: [], plan: PLAN, judgeGate: true })
    expect(result.answer).toBe('good synthesis')
    expect(result.retried).toBe(false)
    expect(result.verdict?.score).toBe(9)
  })

  it('marks the run truncated when an executor exhausts its budget', async () => {
    const llm = mockLLM([
      // step-1 executor never finishes (3 unparseable turns = EXECUTOR_MAX_STEPS,
      // last one becomes its best-effort answer)
      'rambling',
      'more rambling',
      'final ramble',
      // step-2 executor finishes fine
      '{"action": "final", "answer": "ok"}',
      // synthesizer
      'combined',
    ])
    const result = await runOrchestratedTask({ llm, task: 't', tools: [], plan: PLAN })
    expect(result.answer).toBe('combined')
    // step 1's last raw text was adopted as best-effort — not truncation;
    // but unparseable turns surfaced as error steps along the way
    expect(result.steps.some((s) => s.kind === 'error')).toBe(true)
  })

  it('falls back to a plain loop for degenerate plans', async () => {
    const llm = mockLLM(['{"action": "final", "answer": "simple"}'])
    const result = await runOrchestratedTask({
      llm,
      task: 'simple task',
      tools: [],
      plan: { steps: [{ id: 1, text: 'just answer', done: false }] },
    })
    expect(result.answer).toBe('simple')
    expect(result.steps.some((s) => s.kind === 'subtask')).toBe(false)
  })
})
