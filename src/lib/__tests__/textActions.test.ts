import {
  MAX_ACTION_INPUT_CHARS,
  TEXT_ACTIONS,
  buildResearchTask,
  clipInput,
  getTextAction,
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

  it('buildResearchTask demands multi-angle searches and a sources list', () => {
    const task = buildResearchTask('  are heat pumps worth it in Calgary?  ')
    expect(task).toContain('are heat pumps worth it in Calgary?')
    expect(task).toContain('web_search')
    expect(task).toContain('Sources:')
  })
})
