import type { IconName } from '../components/Icon'

export type FlightActivityId =
  | 'travel_trivia'
  | 'tiny_story'
  | 'reflection'
  | 'phrase_practice'
  | 'companion_check_in'

export interface FlightActivity {
  id: FlightActivityId
  label: string
  description: string
  icon: IconName
  prompt: string
}

/**
 * A deliberately small offline activity catalog. These prompts avoid live
 * facts and open-ended research so the screen remains useful with no signal.
 */
export const FLIGHT_ACTIVITIES: readonly FlightActivity[] = [
  {
    id: 'travel_trivia',
    label: 'Travel trivia',
    description: 'A quick place, culture, or science quiz.',
    icon: 'thought',
    prompt: 'Give me one playful travel trivia question, then wait for my answer. Do not use current events or live travel information.',
  },
  {
    id: 'tiny_story',
    label: 'Tiny story',
    description: 'A short imaginative story for the next few minutes.',
    icon: 'file',
    prompt: 'Write a warm, complete story in no more than 120 words. Use a vivid setting and a gentle ending. Do not mention being an AI.',
  },
  {
    id: 'reflection',
    label: 'Reflect',
    description: 'A calm prompt to help you reset and notice the moment.',
    icon: 'privacy',
    prompt: 'Give me one calm, specific reflection prompt and one optional two-minute exercise. Do not diagnose me or make clinical claims.',
  },
  {
    id: 'phrase_practice',
    label: 'Phrase practice',
    description: 'Practice a useful phrase for a place you name.',
    icon: 'translate',
    prompt: 'Teach me one useful everyday phrase for the place or language I mention. Include pronunciation and a plain-English meaning. If I do not name one, ask me which language I want.',
  },
  {
    id: 'companion_check_in',
    label: 'Companion check-in',
    description: 'A private, low-pressure check-in for the flight.',
    icon: 'companion',
    prompt: 'Ask me one warm, low-pressure check-in question. Respond to my answer with a concise observation and one small optional next step. Do not claim to monitor me or remember this outside the current session.',
  },
]

export const FLIGHT_SYSTEM_PROMPT =
  'You are Marmot, a private offline flight companion. You have no web access and must not imply current flight, weather, news, or location data. Be warm, concise, and useful. Keep replies under 80 words unless a story activity explicitly allows 120 words. Never claim background monitoring, hidden memory, or actions you did not take.'

export function getFlightActivity(id: FlightActivityId): FlightActivity {
  return FLIGHT_ACTIVITIES.find((activity) => activity.id === id) ?? FLIGHT_ACTIVITIES[0]
}

export function buildFlightPrompt(activityId: FlightActivityId, context: string): string {
  const activity = getFlightActivity(activityId)
  const cleanContext = context.replace(/\s+/g, ' ').trim().slice(0, 280)
  return cleanContext
    ? `${activity.prompt}\n\nOptional context from me: ${cleanContext}`
    : activity.prompt
}
