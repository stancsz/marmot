/**
 * Launch-screen greetings — one random marmot-ism per app start.
 * Pure and tested; the welcome overlay picks one each launch.
 */

export const GREETINGS: string[] = [
  'Rise and shine. I checked — no shadow, no cloud.',
  'I stored 4 GB of intelligence for winter.',
  'Whistling at strangers since 2026.',
  'Your secrets hibernate here.',
  'Zero servers were consulted in the making of this app.',
  'Briefly emerging from my burrow…',
  'I only phone home. Literally. This is home.',
  'Six more weeks of privacy.',
  'Chubby. Local. Surprisingly smart.',
  'What happens in the burrow stays in the burrow.',
  'Airplane mode? Best mode.',
  'Fed once, thinks forever.',
]

export function pickGreeting(random: () => number = Math.random): string {
  const index = Math.floor(random() * GREETINGS.length)
  return GREETINGS[Math.min(index, GREETINGS.length - 1)]
}
