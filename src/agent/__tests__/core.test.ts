import { extractFirstJson } from '../json'
import { evaluate } from '../calculator'
import { parsePlan, markDone } from '../planner'
import { selectSkills, DEFAULT_SKILLS } from '../skills'
import { MemoryStore } from '../memory'
import { KVStore } from '../types'

describe('extractFirstJson', () => {
  it('parses a bare JSON object', () => {
    expect(extractFirstJson('{"a": 1}')).toEqual({ a: 1 })
  })
  it('parses JSON inside a code fence with prose around it', () => {
    const text = 'Sure! Here you go:\n```json\n{"action": "final", "answer": "42"}\n```\nHope that helps.'
    expect(extractFirstJson(text)).toEqual({ action: 'final', answer: '42' })
  })
  it('handles nested objects and braces inside strings', () => {
    const text = 'x {"a": {"b": "}"}, "c": 2} y'
    expect(extractFirstJson(text)).toEqual({ a: { b: '}' }, c: 2 })
  })
  it('returns null for garbage', () => {
    expect(extractFirstJson('no json here')).toBeNull()
    expect(extractFirstJson('{broken')).toBeNull()
  })
})

describe('calculator', () => {
  it('respects precedence and parentheses', () => {
    expect(evaluate('2+3*4')).toBe(14)
    expect(evaluate('(2+3)*4')).toBe(20)
    expect(evaluate('2^3^2')).toBe(512) // right-associative
    expect(evaluate('10%3')).toBe(1)
    expect(evaluate('-4+10')).toBe(6)
    expect(evaluate('3.5*2')).toBe(7)
  })
  it('rejects bad input', () => {
    expect(() => evaluate('2/0')).toThrow('Division by zero')
    expect(() => evaluate('(2+3')).toThrow('Mismatched parentheses')
    expect(() => evaluate('2+abc')).toThrow()
  })
})

describe('parsePlan', () => {
  it('parses the JSON steps format', () => {
    const plan = parsePlan('{"steps": ["find data", "compute", "answer"]}')
    expect(plan.steps.map((s) => s.text)).toEqual(['find data', 'compute', 'answer'])
    expect(plan.steps.every((s) => !s.done)).toBe(true)
  })
  it('falls back to numbered lists', () => {
    const plan = parsePlan('1. First thing\n2) Second thing\n- Third thing')
    expect(plan.steps.map((s) => s.text)).toEqual(['First thing', 'Second thing', 'Third thing'])
  })
  it('marks steps done immutably', () => {
    const plan = parsePlan('{"steps": ["a", "b"]}')
    const next = markDone(plan, 1)
    expect(next.steps[0].done).toBe(true)
    expect(plan.steps[0].done).toBe(false)
  })
})

describe('selectSkills', () => {
  it('activates skills whose triggers match the task', () => {
    const ids = selectSkills('please calculate 15% of my bill', DEFAULT_SKILLS).map((s) => s.id)
    expect(ids).toContain('math')
    expect(ids).not.toContain('debugging')
  })
  it('returns nothing when no trigger matches', () => {
    expect(selectSkills('hello there', DEFAULT_SKILLS)).toEqual([])
  })
})

function memoryKV(): KVStore {
  const map = new Map<string, string>()
  return {
    async getItem(k) {
      return map.get(k) ?? null
    },
    async setItem(k, v) {
      map.set(k, v)
    },
  }
}

describe('MemoryStore', () => {
  it('stores and retrieves by keyword overlap, recency as tiebreak', async () => {
    let id = 0
    const store = new MemoryStore(memoryKV(), () => `id-${id++}`)
    await store.add('user', 'The user prefers concise answers in French', 1000)
    await store.add('project', 'Marmot uses llama.cpp for local inference', 2000)
    await store.add('episodic', 'Yesterday we discussed llama.cpp quantization formats', 3000)

    const hits = await store.retrieve('what did we say about llama.cpp inference')
    expect(hits.length).toBe(2)
    expect(hits[0].text).toContain('local inference') // 2 overlaps beats 1
    const context = await store.contextFor('llama.cpp')
    expect(context).toContain('Relevant memory:')
  })
  it('removes entries and filters by kind', async () => {
    const store = new MemoryStore(memoryKV())
    const e = await store.add('user', 'Likes dark mode')
    await store.add('project', 'Repo is an Expo app')
    expect((await store.all('user')).length).toBe(1)
    await store.remove(e.id)
    expect((await store.all('user')).length).toBe(0)
    expect((await store.all()).length).toBe(1)
  })
})
