import type { ActionCard, CalendarActionPayload } from './actionCards'

const HOUR_MS = 60 * 60 * 1000
const MAX_TITLE_LENGTH = 80
const MAX_NOTES_LENGTH = 500

const RELATIVE_DATE = /\b(today|tomorrow)\b/i
const TIME_12_HOUR = /\b(0?[1-9]|1[0-2])(?:\s*[:.]\s*([0-5]\d))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)\b/i
const TIME_24_HOUR = /\b([01]?\d|2[0-3])\s*:\s*([0-5]\d)\b/
const NOON_TIME = /\b(noon|midday)\b/i
const MIDNIGHT_TIME = /\bmidnight\b/i

const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const
const MONTH_PATTERN = '(?:' + MONTH_NAMES.flatMap((month) => [month, month.slice(0, 3)]).join('|') + ')'

const ISO_DATE = /\b((?:19|20)\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/
const NUMERIC_DATE = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})\b/
const MONTH_FIRST_DATE = new RegExp(
  `\\b(${MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,)?(?:\\s+(\\d{4}))?\\b`,
  'i'
)
const DAY_FIRST_DATE = new RegExp(
  `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_PATTERN})(?:,)?(?:\\s+(\\d{4}))?\\b`,
  'i'
)
const YEAR_FIRST_DATE = new RegExp(
  `\\b(\\d{4})\\s+(${MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`,
  'i'
)

const OUTPUT_PREFIX = /^(?:(?:ocr|vision|screen|image)(?:\s+(?:text|description|output|result|details))?|extracted\s+(?:text|event|calendar\s+event)|detected\s+(?:text|event|calendar\s+event)?|model\s+output|assistant\s+answer|answer|result|output)\s*[:\-]\s*/i
const FIELD_LABEL = /^(title|event(?:\s+title)?|subject|date|time|when|notes?|details?|location)\s*[:\-\u2013\u2014]\s*(.*)$/i
const PAGE_PREFIX = /^page\s+\d+\s*[:\-\u2013\u2014]\s*/i
const SCREEN_DESCRIPTION = /^(?:screen|image)\s+description\s*[:\-\u2013\u2014]\s*(.*)$/i

type CalendarDateKind = 'absolute' | 'relative'

interface CalendarDateMatch {
  kind: CalendarDateKind
  raw: string
  iso: string
  year: number
  month: number
  day: number
  date: Date
  index: number
}

interface CalendarTimeMatch {
  raw: string
  hour: number
  minute: number
  normalized: string
  index: number
  priority: number
}

interface LabeledFields {
  title: string[]
  date: string[]
  time: string[]
  notes: string[]
}

export interface ParsedCalendarEvent {
  title: string
  date: string
  time: string
  notes: string
  normalized: string
  startDate: Date
}

export interface CalendarParseOptions {
  /** Require the OCR contract's labeled title/date/time fields. */
  requireStructuredFields?: boolean
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`
}

function localDate(year: number, month: number, day: number): Date | null {
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  return date
}

function monthNumber(value: string): number | null {
  const normalized = value.toLowerCase().slice(0, 3)
  const index = MONTH_NAMES.findIndex((month) => month.slice(0, 3) === normalized)
  return index >= 0 ? index + 1 : null
}

function relativeDateMatch(raw: string, now: number, index: number): CalendarDateMatch {
  const date = new Date(now)
  date.setHours(0, 0, 0, 0)
  if (raw.toLowerCase() === 'tomorrow') date.setDate(date.getDate() + 1)
  return {
    kind: 'relative',
    raw,
    iso: isoDate(date.getFullYear(), date.getMonth() + 1, date.getDate()),
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    date,
    index,
  }
}

function absoluteDateMatch(
  raw: string,
  year: number,
  month: number,
  day: number,
  index: number,
  _now: number
): CalendarDateMatch | null {
  const date = localDate(year, month, day)
  if (!date) return null
  return {
    kind: 'absolute',
    raw,
    iso: isoDate(year, month, day),
    year,
    month,
    day,
    date,
    index,
  }
}

function findCalendarDate(input: string, now: number): CalendarDateMatch | null {
  const candidates: CalendarDateMatch[] = []
  const relative = RELATIVE_DATE.exec(input)
  if (relative) candidates.push(relativeDateMatch(relative[1], now, relative.index))

  const iso = ISO_DATE.exec(input)
  if (iso) {
    const parsed = absoluteDateMatch(
      iso[0],
      Number(iso[1]),
      Number(iso[2]),
      Number(iso[3]),
      iso.index,
      now
    )
    if (parsed) candidates.push(parsed)
  }

  const numeric = NUMERIC_DATE.exec(input)
  if (numeric) {
    const first = Number(numeric[1])
    const second = Number(numeric[2])
    const yearValue = Number(numeric[3])
    const year = yearValue < 100 ? 2000 + yearValue : yearValue
    const month = first > 12 ? second : first
    const day = first > 12 ? first : second
    const parsed = absoluteDateMatch(numeric[0], year, month, day, numeric.index, now)
    if (parsed) candidates.push(parsed)
  }

  const monthFirst = MONTH_FIRST_DATE.exec(input)
  if (monthFirst) {
    const month = monthNumber(monthFirst[1])
    const year = Number(monthFirst[3] ?? new Date(now).getFullYear())
    if (month) {
      const parsed = absoluteDateMatch(monthFirst[0], year, month, Number(monthFirst[2]), monthFirst.index, now)
      if (parsed) candidates.push(parsed)
    }
  }

  const dayFirst = DAY_FIRST_DATE.exec(input)
  if (dayFirst) {
    const month = monthNumber(dayFirst[2])
    const year = Number(dayFirst[3] ?? new Date(now).getFullYear())
    if (month) {
      const parsed = absoluteDateMatch(dayFirst[0], year, month, Number(dayFirst[1]), dayFirst.index, now)
      if (parsed) candidates.push(parsed)
    }
  }

  const yearFirst = YEAR_FIRST_DATE.exec(input)
  if (yearFirst) {
    const month = monthNumber(yearFirst[2])
    if (month) {
      const parsed = absoluteDateMatch(yearFirst[0], Number(yearFirst[1]), month, Number(yearFirst[3]), yearFirst.index, now)
      if (parsed) candidates.push(parsed)
    }
  }

  return candidates.sort((left, right) => left.index - right.index || right.raw.length - left.raw.length)[0] ?? null
}

function formatTime(hour: number, minute: number): string {
  const meridiem = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${hour12}:${pad(minute)} ${meridiem}`
}

function findCalendarTime(input: string): CalendarTimeMatch | null {
  const candidates: CalendarTimeMatch[] = []
  const twelveHour = TIME_12_HOUR.exec(input)
  if (twelveHour) {
    const meridiem = twelveHour[3].replace(/[.\s]/g, '').toLowerCase()
    const hour = Number(twelveHour[1]) % 12 + (meridiem === 'pm' ? 12 : 0)
    candidates.push({
      raw: twelveHour[0],
      hour,
      minute: Number(twelveHour[2] ?? 0),
      normalized: formatTime(hour, Number(twelveHour[2] ?? 0)),
      index: twelveHour.index,
      priority: 0,
    })
  }

  const twentyFourHour = TIME_24_HOUR.exec(input)
  if (twentyFourHour) {
    const hour = Number(twentyFourHour[1])
    const minute = Number(twentyFourHour[2])
    candidates.push({
      raw: twentyFourHour[0],
      hour,
      minute,
      normalized: formatTime(hour, minute),
      index: twentyFourHour.index,
      priority: 1,
    })
  }

  const noon = NOON_TIME.exec(input)
  if (noon) {
    candidates.push({
      raw: noon[0],
      hour: 12,
      minute: 0,
      normalized: '12:00 PM',
      index: noon.index,
      priority: 2,
    })
  }

  const midnight = MIDNIGHT_TIME.exec(input)
  if (midnight) {
    candidates.push({
      raw: midnight[0],
      hour: 0,
      minute: 0,
      normalized: '12:00 AM',
      index: midnight.index,
      priority: 2,
    })
  }

  return candidates.sort((left, right) => left.index - right.index || left.priority - right.priority)[0] ?? null
}

function cleanLine(line: string): string {
  return line
    .replace(/^\s*(?:#{1,6}\s*)/, '')
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '')
    .replace(/[\\*_`~]/g, '')
    .replace(/^\s*["']+|["']+\s*$/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

function normalizeVisionSegment(line: string): string | null {
  let result = cleanLine(line).replace(PAGE_PREFIX, '').trim()
  if (!result) return null

  const description = SCREEN_DESCRIPTION.exec(result)
  if (description) {
    const content = cleanLine(description[1])
    if (!FIELD_LABEL.test(content)) return null
    result = content
  }

  result = stripOutputPrefix(result)
  if (/^(?:screenshot|screen\s+description|image\s+description|a\s+screenshot|the\s+screenshot|screen\s+shows|image\s+shows)\b/i.test(result)) {
    return null
  }
  return result || null
}

function stripOutputPrefix(line: string): string {
  let result = line
  for (let index = 0; index < 3; index += 1) {
    const next = result.replace(OUTPUT_PREFIX, '').trim()
    if (next === result) break
    result = next
  }
  return cleanLine(result)
}

function normalizedVisionSegments(input: string): string[] {
  return input
    .replace(/```[^\n]*/g, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .flatMap((line) => line.split('|'))
    .map(normalizeVisionSegment)
    .filter((line): line is string => Boolean(line))
}

export interface ImageTextExtraction {
  content: string
  unclear: boolean
}

const IMAGE_TEXT_EMPTY = /^(?:none|unclear|no readable text|no visible text|cannot read|unable to read)\.?$/i
const IMAGE_TEXT_DESCRIPTION = /^(?:page\s+(?:showing|with|contains|displaying|has|of)|screenshot|screen\s+description|image\s+description|a\s+screenshot|the\s+screenshot|screen\s+shows|image\s+(?:shows|contains|displays)|this\s+(?:image|screenshot|page)\s+(?:shows|contains|displays))\b/i

/**
 * Normalizes generic local vision output without turning a description into OCR.
 * Short results remain usable previews but are marked unclear for human review.
 */
export function normalizeImageText(input: string): ImageTextExtraction {
  const lines = input
    .replace(/```[^\n]*/g, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => {
      let normalized = cleanLine(line).replace(PAGE_PREFIX, '').trim()
      normalized = stripOutputPrefix(normalized)
      return normalized
    })
    .filter((line) => Boolean(line) && !IMAGE_TEXT_EMPTY.test(line))

  const content = lines
    .filter((line) => !IMAGE_TEXT_DESCRIPTION.test(line))
    .join('\n')
    .trim()
  const wordCount = content.split(/\s+/).filter(Boolean).length
  return { content, unclear: !content || wordCount < 4 }
}

function labeledFields(segments: string[]): { fields: LabeledFields; body: string[] } {
  const fields: LabeledFields = { title: [], date: [], time: [], notes: [] }
  const body: string[] = []
  for (const segment of segments) {
    const match = FIELD_LABEL.exec(segment)
    if (!match) {
      body.push(segment)
      continue
    }
    const label = match[1].toLowerCase()
    const value = match[2].trim()
    if (!value) continue
    if (label === 'date') fields.date.push(value)
    else if (label === 'time') fields.time.push(value)
    else if (label === 'notes' || label === 'note' || label === 'details' || label === 'location') fields.notes.push(value)
    else fields.title.push(value)
  }
  return { fields, body }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripCalendarTokens(value: string, date: CalendarDateMatch, time: CalendarTimeMatch): string {
  return value
    .replace(new RegExp(escapeRegExp(date.raw), 'gi'), ' ')
    .replace(new RegExp(escapeRegExp(time.raw), 'gi'), ' ')
    .replace(/\b(?:on|at|@|from|date|time|when)\b\s*[:\-\u2013\u2014]?\s*/gi, ' ')
    .replace(/\s*[,:;|\u2013\u2014-]\s*$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function metadataOnly(value: string, date: CalendarDateMatch, time: CalendarTimeMatch): boolean {
  return !stripCalendarTokens(value, date, time).replace(/^[\s:\u2013\u2014-]+|[\s:\u2013\u2014-]+$/g, '').trim()
}

function cleanTitle(value: string, date: CalendarDateMatch, time: CalendarTimeMatch): string {
  const title = stripCalendarTokens(value, date, time)
    .replace(/^(?:event|title|subject)\s*[:\-\u2013\u2014]\s*/i, '')
    .replace(/^[\s:|\u2013\u2014-]+|[\s:|\u2013\u2014-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return (title || 'Marmot event').slice(0, MAX_TITLE_LENGTH)
}

function cleanNotes(values: string[], date: CalendarDateMatch, time: CalendarTimeMatch): string {
  const notes = values
    .map((value) => value
      .replace(new RegExp(escapeRegExp(date.raw), 'gi'), ' ')
      .replace(new RegExp(escapeRegExp(time.raw), 'gi'), ' ')
      .replace(/^[\s:|\u2013\u2014-]+|[\s:|\u2013\u2014-]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim())
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)
    .join(' | ')
  return notes.slice(0, MAX_NOTES_LENGTH)
}

function startDateFor(date: CalendarDateMatch, time: CalendarTimeMatch): Date {
  const startDate = new Date(date.date)
  startDate.setHours(time.hour, time.minute, 0, 0)
  return startDate
}

/**
 * Parses local vision output into a bounded, reviewable calendar event.
 * A date and explicit time are both required; the parser never supplies a default time.
 */
export function parseCalendarEvent(
  input: string,
  now = Date.now(),
  options: CalendarParseOptions = {}
): ParsedCalendarEvent | null {
  const segments = normalizedVisionSegments(input)
  if (!segments.length) return null

  const { fields, body } = labeledFields(segments)
  if (
    options.requireStructuredFields &&
    (!fields.title.length || !fields.date.length || !fields.time.length)
  ) {
    return null
  }
  const source = segments.join(' | ')
  const date = findCalendarDate(fields.date.join(' ') || source, now)
  const time = findCalendarTime(fields.time.join(' ') || source)
  if (!date || !time) return null

  const bodyTitleIndex = body.findIndex((value) => !metadataOnly(value, date, time))
  const titleValue = fields.title[0] ?? body[bodyTitleIndex] ?? source
  const title = cleanTitle(titleValue, date, time)

  const noteValues = [
    ...fields.notes,
    ...body.filter((value, index) =>
      (fields.title.length > 0 || index !== bodyTitleIndex) && !metadataOnly(value, date, time)
    ),
  ]
  const notes = cleanNotes(noteValues, date, time)
  const dateLabel = date.kind === 'relative' ? date.raw.toLowerCase() : date.iso
  const normalized = `${title} on ${dateLabel} at ${time.normalized}${notes ? ` | ${notes}` : ''}`

  return {
    title,
    date: date.iso,
    time: time.normalized,
    notes,
    normalized,
    startDate: startDateFor(date, time),
  }
}

/** Returns the canonical one-line calendar text, or null when date/time extraction is unsafe. */
export function normalizeCalendarEvent(
  input: string,
  now = Date.now(),
  options: CalendarParseOptions = {}
): string | null {
  return parseCalendarEvent(input, now, options)?.normalized ?? null
}

function nextHour(now: number): Date {
  const startDate = new Date(now)
  startDate.setMinutes(0, 0, 0)
  startDate.setTime(startDate.getTime() + HOUR_MS)
  return startDate
}

function eventTitle(input: string): string {
  const normalized = input.split('|', 1)[0].replace(/\s+/g, ' ').trim()
  return (
    normalized
      .replace(/\b(?:today|tomorrow)\s+(?:at\s+)?\d{1,2}(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?)\b/i, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_TITLE_LENGTH) || normalized.slice(0, MAX_TITLE_LENGTH) || 'Marmot event'
  )
}

export interface CalendarEventDraft extends CalendarActionPayload {}

export function hasExplicitCalendarTime(input: string): boolean {
  return parseCalendarEvent(input) !== null
}

export function calendarEventDraft(input: string, now = Date.now()): CalendarEventDraft {
  const parsed = parseCalendarEvent(input, now)
  if (parsed) {
    return {
      title: parsed.title,
      // Keep the original preview text in notes so the approval card remains
      // editable/readable without losing any user-provided context.
      notes: input.trim(),
      startDate: parsed.startDate,
      endDate: new Date(parsed.startDate.getTime() + HOUR_MS),
    }
  }

  const title = eventTitle(input)
  const startDate = nextHour(now)
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
