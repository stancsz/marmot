import { buildAttachmentFromCopy } from './attachments'
import type { Attachment } from '../types'

/** The common fields exposed by expo-share-intent on iOS and Android. */
export interface SharedFileInput {
  fileName?: string | null
  mimeType?: string | null
  path?: string | null
  filePath?: string | null
  size?: number | null
  fileSize?: number | string | null
}

export class SharedMediaValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SharedMediaValidationError'
  }
}

function sizeBytes(file: SharedFileInput): number {
  const raw = file.size ?? file.fileSize
  const parsed = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

/**
 * Copy one external image into Marmot's private attachment directory. The
 * share plugin reports `path` on iOS and `filePath` on Android, so the native
 * provider URI never reaches the model directly.
 */
export function sharedFileToAttachment(file: SharedFileInput): Attachment {
  const sourceUri = file.filePath ?? file.path
  if (!sourceUri) throw new SharedMediaValidationError('The shared image has no readable local path.')

  const mimeType = file.mimeType?.toLowerCase() ?? ''
  if (!mimeType.startsWith('image/')) {
    throw new SharedMediaValidationError('Marmot only imports shared images into the screenshot action flow.')
  }

  return buildAttachmentFromCopy({
    name: file.fileName?.trim() || 'shared-image',
    size: sizeBytes(file),
    mimeType,
    sourceUri,
  })
}
