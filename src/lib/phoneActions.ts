import type { ActionCard, CalendarActionPayload } from './actionCards'

const HOUR_MS = 60 * 60 * 1000
const EXPLICIT_TIME = /\b(today|tomorrow)\s+(?:at\s+)?(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/i

function nextHour(now: number): Date {
  const startDate = new Date(now)
  startDate.setMinutes(0, 0, 0)
  startDate.setTime(startDate.getTime() + HOUR_MS)
  return startDate
}

function parsedStart(input: string, now: number): Date {
  const match = input.match(EXPLICIT_TIME)
  if (!match) return nextHour(now)

  const [, day, rawHour, rawMinute, rawMeridiem] = match
  const hour = Number(rawHour)
  const minute = Number(rawMinute ?? 0)
  if (hour < 1 || hour > 12) return nextHour(now)

  const startDate = new Date(now)
  if (day.toLowerCase() === 'tomorrow') startDate.setDate(startDate.getDate() + 1)
  const meridiem = rawMeridiem.toLowerCase().replace(/\./g, '')
  const hour24 = (hour % 12) + (meridiem === 'pm' ? 12 : 0)
  startDate.setHours(hour24, minute, 0, 0)
  return startDate
}

function eventTitle(input: string): string {
  const normalized = input.split('|', 1)[0].replace(/\s+/g, ' ').trim()
  return (
    normalized
      .replace(EXPLICIT_TIME, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || normalized.slice(0, 80) || 'Marmot event'
  )
}

export interface CalendarEventDraft extends CalendarActionPayload {}

export function hasExplicitCalendarTime(input: string): boolean {
  return EXPLICIT_TIME.test(input)
}

export function calendarEventDraft(input: string, now = Date.now()): CalendarEventDraft {
  const title = eventTitle(input)
  const startDate = parsedStart(input, now)
  const endDate = new Date(startDate.getTime() + HOUR_MS)
  return { title, notes: input.trim(), startDate, endDate }
}

export function calendarEventCard(input: string, now = Date.now()): ActionCard {
  const phoneAction = calendarEventDraft(input, now)
  return {
    kind: 'calendar_event',
    title: 'Calendar event',
    sourceAction: 'calendar_event',
    content: phoneAction.notes,
    requiresApproval: true,
    status: 'preview',
    phoneAction,
  }
}
