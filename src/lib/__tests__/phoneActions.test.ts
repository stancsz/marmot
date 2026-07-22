import { calendarEventCard, calendarEventDraft, hasExplicitCalendarTime } from '../phoneActions'

describe('phone action previews', () => {
  it('creates a deterministic one-hour calendar preview', () => {
    const draft = calendarEventDraft('Team sync', 1_700_000_000_000)
    expect(draft.title).toBe('Team sync')
    expect(draft.endDate.getTime() - draft.startDate.getTime()).toBe(60 * 60 * 1000)
    expect(draft.endDate.getTime()).toBeGreaterThan(draft.startDate.getTime())
  })

  it('recognizes only explicit relative times for screenshot extraction', () => {
    expect(hasExplicitCalendarTime('Team sync tomorrow at 10 AM | Bring the agenda')).toBe(true)
    expect(hasExplicitCalendarTime('Team sync sometime next week')).toBe(false)
  })

  it('wraps the draft in an approval-required action card', () => {
    const card = calendarEventCard('Team sync', 1_700_000_000_000)
    expect(card.kind).toBe('calendar_event')
    expect(card.requiresApproval).toBe(true)
    expect(card.phoneAction?.title).toBe('Team sync')
    expect(card.status).toBe('preview')
  })

  it('grounds explicit tomorrow times instead of scheduling at the next hour', () => {
    const now = new Date(2026, 6, 21, 22, 0, 0).getTime()
    const draft = calendarEventDraft('Team sync tomorrow at 10 AM', now)

    expect(draft.title).toBe('Team sync')
    expect(draft.startDate.getDate()).toBe(22)
    expect(draft.startDate.getHours()).toBe(10)
    expect(draft.startDate.getMinutes()).toBe(0)
    expect(draft.endDate.getHours()).toBe(11)
  })
})
