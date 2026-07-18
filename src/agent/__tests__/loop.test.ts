import { runAgentLoop, parseAction, DEFAULT_POLICIES } from '../loop'
import { calculatorTool, datetimeTool, searchChatsTool } from '../tools'
import { reflect, judge } from '../reflection'
import { makePlan } from '../planner'
import { AgentLLM, LLMMessage } from '../types'
import { Chat } from '../../types'

/** Scripted LLM: returns canned responses in order, records every call. */
function mockLLM(responses: string[]): AgentLLM & { calls: LLMMessage[][] } {
  let i = 0
  const calls: LLMMessage[][] = []
  return {
    calls,
    async complete(messages) {
      calls.push(messages)
      if (i >= responses.length) throw new Error('MockLLM exhausted')
      return responses[i++]
    },
  }
}

describe('runAgentLoop', () => {
  it('executes a tool call and uses the observation in the final answer', async () => {
    const llm = mockLLM([
      '{"thought": "need exact math", "action": "tool", "tool": "calculator", "args": {"expression": "37*43"}}',
      '{"thought": "got it", "action": "final", "answer": "37 × 43 = 1591"}',
    ])
    const result = await runAgentLoop({ llm, task: 'what is 37*43?', tools: [calculatorTool()] })

    expect(result.truncated).toBe(false)
    expect(result.answer).toBe('37 × 43 = 1591')
    const observation = result.steps.find((s) => s.kind === 'observation')
    expect(observation?.content).toBe('1591')
    // the observation was actually fed back to the model
    expect(llm.calls[1].some((m) => m.content.includes('Observation: 1591'))).toBe(true)
  })

  it('rejects tools outside the policy allowlist', async () => {
    const llm = mockLLM([
      '{"action": "tool", "tool": "calculator", "args": {"expression": "1+1"}}',
      '{"action": "final", "answer": "done"}',
    ])
    const result = await runAgentLoop({
      llm,
      task: 'compute',
      tools: [calculatorTool()],
      policies: { ...DEFAULT_POLICIES, allowedTools: [] },
    })
    const observation = result.steps.find((s) => s.kind === 'observation')
    expect(observation?.content).toContain('not available')
  })

  it('stops at the step budget and reports truncation honestly', async () => {
    const llm = mockLLM([
      '{"action": "tool", "tool": "datetime", "args": {}}',
      '{"action": "tool", "tool": "datetime", "args": {}}',
    ])
    const result = await runAgentLoop({
      llm,
      task: 'loop forever',
      tools: [datetimeTool(() => new Date(2026, 6, 18, 12, 0, 0))],
      policies: { ...DEFAULT_POLICIES, maxSteps: 2 },
    })
    expect(result.truncated).toBe(true)
    expect(result.answer).toContain('ran out of steps')
  })

  it('recovers from malformed output by re-requesting the format', async () => {
    const llm = mockLLM([
      'Sure! I will help you with that.',
      '{"action": "final", "answer": "recovered"}',
    ])
    const result = await runAgentLoop({ llm, task: 'hi', tools: [] })
    expect(result.answer).toBe('recovered')
    expect(result.steps.some((s) => s.kind === 'error')).toBe(true)
  })

  it('truncates oversized observations per policy', async () => {
    const llm = mockLLM([
      '{"action": "tool", "tool": "search_chats", "args": {"query": "expo"}}',
      '{"action": "final", "answer": "ok"}',
    ])
    const bigChat: Chat = {
      id: 'c1',
      title: 'Big',
      modelId: null,
      createdAt: 0,
      updatedAt: 0,
      messages: [
        { id: 'm1', role: 'user', content: 'expo '.repeat(500), createdAt: 0 },
      ],
    }
    const result = await runAgentLoop({
      llm,
      task: 'find expo notes',
      tools: [searchChatsTool(async () => [bigChat])],
      policies: { ...DEFAULT_POLICIES, maxObservationChars: 50 },
    })
    const observation = result.steps.find((s) => s.kind === 'observation')
    expect(observation!.content.length).toBeLessThanOrEqual(50 + '…[truncated]'.length)
  })
})

describe('plan integration', () => {
  const plan = {
    steps: [
      { id: 1, text: 'compute the tip', done: false },
      { id: 2, text: 'split the total', done: false },
    ],
  }

  it('injects the plan into the system prompt and emits plan_check on done_step', async () => {
    const llm = mockLLM([
      '{"action": "tool", "tool": "calculator", "args": {"expression": "84.50*0.18"}, "done_step": 1}',
      '{"action": "final", "answer": "done", "done_step": 2}',
    ])
    const result = await runAgentLoop({
      llm,
      task: 'tip math',
      tools: [calculatorTool()],
      plan,
    })
    expect(llm.calls[0][0].content).toContain('Your plan:')
    expect(llm.calls[0][0].content).toContain('1. compute the tip')
    const checks = result.steps.filter((s) => s.kind === 'plan_check').map((s) => s.content)
    expect(checks).toEqual(['1', '2'])
  })

  it('ignores done_step ids that are not in the plan', async () => {
    const llm = mockLLM(['{"action": "final", "answer": "x", "done_step": 99}'])
    const result = await runAgentLoop({ llm, task: 't', tools: [], plan })
    expect(result.steps.some((s) => s.kind === 'plan_check')).toBe(false)
  })
})

describe('shouldPlan', () => {
  const { shouldPlan } = require('../planner') as typeof import('../planner')

  it('plans for multi-sentence, sequenced, or long tasks', () => {
    expect(shouldPlan('Find the population of Canada. Then compare it to Australia.')).toBe(true)
    expect(shouldPlan('first check the weather and then suggest an outfit')).toBe(true)
    expect(shouldPlan('x'.repeat(150))).toBe(true)
  })
  it('skips planning for simple one-shot questions', () => {
    expect(shouldPlan('what is 2+2?')).toBe(false)
    expect(shouldPlan('hello')).toBe(false)
  })
})

describe('parseAction', () => {
  it('parses tool and final actions, tolerating fences', () => {
    expect(parseAction('```json\n{"action":"final","answer":"x"}\n```')).toEqual({
      action: 'final',
      answer: 'x',
      thought: undefined,
    })
    expect(parseAction('{"action":"tool","tool":"t","args":{"a":1}}')).toMatchObject({
      action: 'tool',
      tool: 't',
      args: { a: 1 },
    })
  })
  it('parses done_step in both snake and camel case', () => {
    expect(parseAction('{"action":"final","answer":"x","done_step":2}')).toMatchObject({ doneStep: 2 })
    expect(parseAction('{"action":"final","answer":"x","doneStep":"3"}')).toMatchObject({ doneStep: 3 })
  })
  it('returns null for wrong shapes', () => {
    expect(parseAction('{"action":"dance"}')).toBeNull()
    expect(parseAction('plain text')).toBeNull()
  })
})

describe('planner + reflection + judge (LLM-backed, mocked)', () => {
  it('makePlan parses model JSON into steps', async () => {
    const llm = mockLLM(['{"steps": ["research", "draft", "verify"]}'])
    const plan = await makePlan(llm, 'write a report')
    expect(plan.steps).toHaveLength(3)
  })

  it('reflect passes through a good answer and revises a bad one', async () => {
    const good = await reflect(mockLLM(['{"ok": true, "critique": "solid"}']), 't', 'a')
    expect(good.ok).toBe(true)

    const bad = await reflect(
      mockLLM(['{"ok": false, "critique": "wrong sum", "revisedAnswer": "correct sum is 5"}']),
      't',
      'a'
    )
    expect(bad.ok).toBe(false)
    expect(bad.revisedAnswer).toBe('correct sum is 5')

    const garbage = await reflect(mockLLM(['not json at all']), 't', 'a')
    expect(garbage.ok).toBe(true) // unparseable reflection must not sink the answer
  })

  it('judge clamps scores and fails closed on garbage', async () => {
    const verdict = await judge(mockLLM(['{"accept": true, "score": 27, "reasons": "fine"}']), 't', 'a')
    expect(verdict.accept).toBe(true)
    expect(verdict.score).toBe(10)

    const garbage = await judge(mockLLM(['nope']), 't', 'a')
    expect(garbage.accept).toBe(false)
  })
})

describe('tools', () => {
  it('search_chats ranks by keyword hits', async () => {
    const chats: Chat[] = [
      {
        id: '1',
        title: 'Travel',
        modelId: null,
        createdAt: 0,
        updatedAt: 0,
        messages: [{ id: 'a', role: 'assistant', content: 'Banff hikes are great in summer', createdAt: 0 }],
      },
      {
        id: '2',
        title: 'Cooking',
        modelId: null,
        createdAt: 0,
        updatedAt: 0,
        messages: [{ id: 'b', role: 'assistant', content: 'Banff has summer food festivals and summer markets', createdAt: 0 }],
      },
    ]
    const tool = searchChatsTool(async () => chats)
    const out = String(await tool.run({ query: 'banff summer' }))
    expect(out.split('\n')[0]).toContain('[Cooking]') // 2 keyword hits ranks first
    expect(String(await tool.run({ query: 'zzz' }))).toBe('No matches found.')
  })
})
