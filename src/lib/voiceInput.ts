/** Merge a final speech transcript into a command without discarding typed text. */
export function appendVoiceTranscript(existing: string, heard: string): string {
  const current = existing.trim()
  const spoken = heard.trim()
  if (!spoken) return existing
  return current ? `${current} ${spoken}` : spoken
}
