import {
  calendarEventCard,
  calendarEventDraft,
  hasExplicitCalendarTime,
  normalizeCalendarEvent,
  normalizeImageText,
  parseCalendarEvent,
} from '../phoneActions'

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

  it('normalizes an absolute date and keeps the explicit time', () => {
    const parsed = parseCalendarEvent(
      'Event: Team sync on July 24, 2026 at 3:30 PM | Bring the agenda',
      new Date(2026, 6, 21, 9, 0, 0).getTime()
    )

    expect(parsed).toMatchObject({
      title: 'Team sync',
      date: '2026-07-24',
      time: '3:30 PM',
      notes: 'Bring the agenda',
      normalized: 'Team sync on 2026-07-24 at 3:30 PM | Bring the agenda',
    })
    expect(parsed?.startDate.getFullYear()).toBe(2026)
    expect(parsed?.startDate.getMonth()).toBe(6)
    expect(parsed?.startDate.getDate()).toBe(24)
    expect(parsed?.startDate.getHours()).toBe(15)
  })

  it('normalizes relative today/tomorrow output into a calendar-safe line', () => {
    const now = new Date(2026, 6, 21, 22, 0, 0).getTime()
    expect(normalizeCalendarEvent('**Team sync** tomorrow at 10 AM | Bring the agenda', now)).toBe(
      'Team sync on tomorrow at 10:00 AM | Bring the agenda'
    )

    const draft = calendarEventDraft('Team sync on tomorrow at 10:00 AM | Bring the agenda', now)
    expect(draft.startDate.getDate()).toBe(22)
    expect(draft.startDate.getHours()).toBe(10)
  })

  it('strips Page/OCR/screen-description wrappers and markdown from vision fixtures', () => {
    const noisyVisionOutput = [
      'Page 1: Screenshot of a calendar card with text and icons.',
      'Screen description: The event details are shown below.',
      'OCR text:',
      '**Event:** Dentist appointment',
      '- **Date:** 2026-07-24',
      '- **Time:** 09:15 a.m.',
      '- **Notes:** Bring insurance card',
    ].join('\n')

    expect(normalizeCalendarEvent(noisyVisionOutput, new Date(2026, 6, 21).getTime())).toBe(
      'Dentist appointment on 2026-07-24 at 9:15 AM | Bring insurance card'
    )
    expect(normalizeCalendarEvent(noisyVisionOutput, new Date(2026, 6, 21).getTime())).not.toContain('Page 1')
    expect(normalizeCalendarEvent(noisyVisionOutput, new Date(2026, 6, 21).getTime())).not.toContain('Screen description')
    expect(normalizeCalendarEvent(noisyVisionOutput, new Date(2026, 6, 21).getTime())).not.toContain('OCR text')
  })

  it('preserves readable generic image text while removing OCR wrappers', () => {
    const extracted = normalizeImageText([
      'OCR text:',
      '**Cafe North**',
      '- Total: $14.25',
      '- 2026-07-24 09:15 AM',
    ].join('\n'))

    expect(extracted).toEqual({
      content: 'Cafe North\nTotal: $14.25\n2026-07-24 09:15 AM',
      unclear: false,
    })
  })

  it('fails closed for NONE and marks short OCR as unclear', () => {
    expect(normalizeImageText('NONE')).toEqual({ content: '', unclear: true })
    expect(normalizeImageText('Total $14.25')).toEqual({ content: 'Total $14.25', unclear: true })
    expect(normalizeImageText('Page showing information about the app.')).toEqual({ content: '', unclear: true })
  })

  it('rejects vision output with no explicit time', () => {
    expect(parseCalendarEvent('Page 1: Event: Team sync tomorrow | Bring the agenda')).toBeNull()
    expect(normalizeCalendarEvent('Event: Team sync on 2026-07-24 | Bring the agenda')).toBeNull()
  })

  it('requires labeled fields for strict OCR extraction', () => {
    const now = new Date(2026, 6, 21).getTime()
    expect(normalizeCalendarEvent('Status bar 10 AM and a meeting tomorrow', now, {
      requireStructuredFields: true,
    })).toBeNull()
    expect(normalizeCalendarEvent([
      'TITLE: Team sync',
      'DATE: 2026-07-24',
      'TIME: 10:00 AM',
      'NOTES: Bring the agenda',
    ].join('\n'), now, { requireStructuredFields: true })).toBe(
      'Team sync on 2026-07-24 at 10:00 AM | Bring the agenda'
    )
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
