import {
  buildFlightPrompt,
  FLIGHT_ACTIVITIES,
  FLIGHT_SYSTEM_PROMPT,
  getFlightActivity,
} from '../flightMode'

describe('Flight mode activities', () => {
  it('offers distinct bounded offline activities', () => {
    expect(FLIGHT_ACTIVITIES).toHaveLength(5)
    expect(new Set(FLIGHT_ACTIVITIES.map((activity) => activity.id)).size).toBe(5)
    expect(FLIGHT_ACTIVITIES.every((activity) => activity.prompt.length > 20)).toBe(true)
  })

  it('falls back to the first activity for an unknown persisted id', () => {
    expect(getFlightActivity('not-a-real-id' as never).id).toBe('travel_trivia')
  })

  it('bounds optional user context and keeps the offline contract', () => {
    const context = 'x'.repeat(500)
    const prompt = buildFlightPrompt('reflection', context)
    expect(prompt.length).toBeLessThan(650)
    expect(FLIGHT_SYSTEM_PROMPT).toMatch(/no web access/i)
    expect(FLIGHT_SYSTEM_PROMPT).toMatch(/background monitoring/i)
  })
})
