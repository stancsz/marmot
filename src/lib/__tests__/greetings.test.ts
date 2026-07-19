import { GREETINGS, pickGreeting } from '../greetings'

describe('launch greetings', () => {
  it('all greetings are short, non-empty one-liners', () => {
    expect(GREETINGS.length).toBeGreaterThanOrEqual(8)
    for (const g of GREETINGS) {
      expect(g.trim().length).toBeGreaterThan(5)
      expect(g.length).toBeLessThanOrEqual(70) // fits one or two lines on a phone
      expect(g).not.toContain('\n')
    }
  })

  it('picks deterministically with an injected random and never goes out of bounds', () => {
    expect(pickGreeting(() => 0)).toBe(GREETINGS[0])
    expect(pickGreeting(() => 0.999999)).toBe(GREETINGS[GREETINGS.length - 1])
    expect(pickGreeting(() => 1)).toBe(GREETINGS[GREETINGS.length - 1]) // clamp guard
    expect(GREETINGS).toContain(pickGreeting())
  })
})
