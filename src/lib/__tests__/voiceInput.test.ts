import { appendVoiceTranscript } from '../voiceInput'

describe('quick-action voice input', () => {
  it('appends speech after typed command text', () => {
    expect(appendVoiceTranscript('Summarize this', 'and keep the numbers')).toBe(
      'Summarize this and keep the numbers'
    )
  })

  it('uses speech as the command when the box is empty', () => {
    expect(appendVoiceTranscript('  ', '  Extract the dates  ')).toBe('Extract the dates')
  })

  it('leaves existing text unchanged for an empty transcript', () => {
    expect(appendVoiceTranscript('Keep this', '   ')).toBe('Keep this')
  })
})
