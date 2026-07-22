import {
  MAX_ACTION_INPUT_CHARS,
  TEXT_ACTIONS,
  TEXT_ACTION_GROUPS,
  buildResearchTask,
  clipInput,
  getTextAction,
  redactPii,
} from '../textActions'

describe('quick text actions', () => {
  it('every action embeds the input text and has unique ids', () => {
    const ids = new Set<string>()
    for (const action of TEXT_ACTIONS) {
      expect(ids.has(action.id)).toBe(false)
      ids.add(action.id)
      const prompt = action.buildPrompt('THE_INPUT_TEXT')
      expect(prompt).toContain('THE_INPUT_TEXT')
      expect(prompt.length).toBeGreaterThan(30)
    }
  })

  it('groups the common action catalog by user intent', () => {
    expect(TEXT_ACTIONS.length).toBeGreaterThanOrEqual(14)
    expect(TEXT_ACTION_GROUPS.map((group) => group.label)).toEqual(['Understand', 'Write', 'Plan', 'Protect'])
    const grouped = TEXT_ACTION_GROUPS.flatMap((group) => group.actions)
    expect(new Set(grouped.map((action) => action.id)).size).toBe(TEXT_ACTIONS.length)
  })

  it('clips oversized input so prompts stay within small-model context', () => {
    const huge = 'x'.repeat(MAX_ACTION_INPUT_CHARS + 5000)
    const clipped = clipInput(huge)
    expect(clipped.length).toBeLessThanOrEqual(MAX_ACTION_INPUT_CHARS + 20)
    expect(clipped).toContain('[input truncated]')
    expect(getTextAction('summarize')!.buildPrompt(huge)).toContain('[input truncated]')
  })

  it('injects option values (translate target, tone) with sane defaults', () => {
    const translate = getTextAction('translate')!
    expect(translate.buildPrompt('hola', 'Japanese')).toContain('into Japanese')
    expect(translate.buildPrompt('hola')).toContain('into English')
    const tone = getTextAction('tone')!
    expect(tone.buildPrompt('hey', 'persuasive')).toContain('persuasive tone')
  })

  it('hardens the draft-reply prompt for small local models', () => {
    const reply = getTextAction('reply')!
    const prompt = reply.buildPrompt('Could we move our 10 AM team sync to 2 PM tomorrow? I have a conflict.')
    expect(prompt).toContain('1-3 short sentences')
    expect(prompt).toMatch(/do not say "i can help"/i)
    expect(prompt).toContain('10 AM team sync')
    expect(prompt).toMatch(/no preamble, labels, separators, or markdown/i)
  })

  it('redacts common identifiers locally without changing unrelated text', () => {
    const input = 'Email jane@example.com or call 403-555-0199. Visit https://example.com and use 4111 1111 1111 1111. SSN 123-45-6789.'
    const redacted = redactPii(input)

    expect(redacted).toContain('[email redacted]')
    expect(redacted).toContain('[phone redacted]')
    expect(redacted).toContain('[URL redacted]')
    expect(redacted).toContain('[card redacted]')
    expect(redacted).toContain('[SSN redacted]')
    expect(redacted).toContain('Email')
    expect(redacted).not.toContain('jane@example.com')
    expect(getTextAction('pii_eraser')?.runLocally?.(input)).toBe(redacted)
  })

  it('buildResearchTask demands multi-angle searches and a sources list', () => {
    const task = buildResearchTask('  are heat pumps worth it in Calgary?  ')
    expect(task).toContain('are heat pumps worth it in Calgary?')
    expect(task).toContain('web_search')
    expect(task).toContain('Sources:')
  })
})
