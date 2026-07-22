import { LOCAL_DEMO_PROMPT, LOCAL_DEMO_PROOF } from '../localDemo'

describe('first-run local demo', () => {
  it('uses a real, short content question', () => {
    expect(LOCAL_DEMO_PROMPT).toMatch(/capital of France/i)
    expect(LOCAL_DEMO_PROMPT.length).toBeLessThan(100)
  })

  it('states the local-only proof plainly', () => {
    expect(LOCAL_DEMO_PROOF).toMatch(/phone|local-only/i)
    expect(LOCAL_DEMO_PROOF).not.toMatch(/guaranteed|always/i)
  })
})
