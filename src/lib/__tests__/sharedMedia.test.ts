jest.mock('../attachments', () => ({
  buildAttachmentFromCopy: jest.fn((opts: any) => ({
    name: opts.name,
    mimeType: opts.mimeType,
    sizeBytes: opts.size,
    uri: 'file:///private/attachments/copied-image',
  })),
}))

import { buildAttachmentFromCopy } from '../attachments'
import { SharedMediaValidationError, sharedFileToAttachment } from '../sharedMedia'

describe('external shared media normalization', () => {
  beforeEach(() => jest.clearAllMocks())

  it('copies an Android filePath and normalizes its string byte size', () => {
    const attachment = sharedFileToAttachment({
      fileName: 'event.png',
      mimeType: 'IMAGE/PNG',
      filePath: 'file:///provider/event.png',
      fileSize: '2048',
    })

    expect(buildAttachmentFromCopy).toHaveBeenCalledWith({
      name: 'event.png',
      mimeType: 'image/png',
      size: 2048,
      sourceUri: 'file:///provider/event.png',
    })
    expect(attachment.uri).toBe('file:///private/attachments/copied-image')
  })

  it('copies an iOS path and uses a safe fallback filename', () => {
    sharedFileToAttachment({
      mimeType: 'image/jpeg',
      path: 'file:///share/IMG_1001.jpg',
      size: 512,
    })

    expect(buildAttachmentFromCopy).toHaveBeenCalledWith({
      name: 'shared-image',
      mimeType: 'image/jpeg',
      size: 512,
      sourceUri: 'file:///share/IMG_1001.jpg',
    })
  })

  it('rejects non-image files and missing provider paths before copying', () => {
    expect(() => sharedFileToAttachment({
      fileName: 'notes.txt',
      mimeType: 'text/plain',
      path: 'file:///share/notes.txt',
    })).toThrow(SharedMediaValidationError)
    expect(() => sharedFileToAttachment({
      fileName: 'event.png',
      mimeType: 'image/png',
    })).toThrow(/no readable local path/i)
    expect(buildAttachmentFromCopy).not.toHaveBeenCalled()
  })
})
