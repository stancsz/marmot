jest.mock('expo-file-system', () => ({
  File: class MockFile {
    constructor(private readonly uri: string) {}

    async text() {
      return this.uri === 'file:///notes.txt' ? 'Keep this private note local.' : ''
    }
  },
}))

jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn().mockResolvedValue('Keep this private note local.'),
}))

import {
  MAX_ATTACHMENT_CONTEXT_CHARS,
  attachmentCapabilityLabel,
  buildCompletionMessages,
  formatTextAttachmentContext,
  formatUnsupportedAttachmentContext,
} from '../attachmentContext'

const textAttachment = {
  name: 'notes.md',
  mimeType: 'text/plain',
  sizeBytes: 32,
  uri: 'file:///notes.txt',
} as const

describe('local attachment grounding', () => {
  it('reads a text attachment into completion context without changing its clean label', async () => {
    const messages = await buildCompletionMessages([
      { role: 'user', content: 'Summarize this.', attachment: textAttachment },
    ])

    expect(messages[0].content).toContain('Keep this private note local.')
    expect(messages[0].content).toContain('untrusted reference text')
    expect(messages[0].content).toContain('Summarize this.')
  })

  it('bounds long file content and preserves the trust boundary', () => {
    const context = formatTextAttachmentContext(textAttachment, 'x'.repeat(MAX_ATTACHMENT_CONTEXT_CHARS + 20))

    expect(context).toContain('untrusted reference text')
    expect(context).toContain('Attachment truncated')
    expect(context).not.toContain('x'.repeat(MAX_ATTACHMENT_CONTEXT_CHARS + 1))
  })

  it('labels media honestly until a compatible multimodal model is installed', () => {
    const image = { name: 'receipt.png', mimeType: 'image/png' }

    expect(attachmentCapabilityLabel(textAttachment)).toBe('Included locally')
    expect(attachmentCapabilityLabel(image)).toBe('Needs a multimodal model')
    expect(attachmentCapabilityLabel(image, { vision: true })).toBe('Ready for vision')
    expect(formatUnsupportedAttachmentContext(image)).toMatch(/cannot inspect an image/i)
    expect(formatUnsupportedAttachmentContext(image)).toMatch(/Do not guess/i)
  })
})
