import { Directory, File, Paths } from 'expo-file-system'
import * as DocumentPicker from 'expo-document-picker'
import { Alert } from 'react-native'
import { Attachment } from '../types'

/** 10 MB — keeps context budget reasonable for on-device models. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

/**
 * Allowlist of mime types we will ingest into a chat message. Anything
 * outside this set is rejected before the file is copied anywhere — the
 * picker can surface unexpected mime types depending on the host OS.
 */
export const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
])

/** Filename → mime fallback when the OS doesn't report one. */
function inferMimeType(name: string, declared?: string | null): string {
  if (declared) return declared
  const ext = name.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'pdf':
      return 'application/pdf'
    case 'txt':
    case 'md':
      return 'text/plain'
    default:
      return 'application/octet-stream'
  }
}

/** Strip path separators and control characters from a user-visible filename. */
function sanitizeName(name: string): string {
  return name.replace(/[\\/]/g, '_').replace(/[\x00-\x1f]/g, '').trim() || 'attachment'
}

export class AttachmentValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AttachmentValidationError'
  }
}

/**
 * Validate a picked file against the allowlist + size cap. Returns a
 * normalized mime type, or throws {@link AttachmentValidationError}.
 */
export function validatePickedFile(opts: {
  name: string
  size?: number | null
  mimeType?: string | null
}): { name: string; mimeType: string; sizeBytes: number } {
  const mimeType = inferMimeType(opts.name, opts.mimeType)
  const sizeBytes = typeof opts.size === 'number' && opts.size > 0 ? opts.size : 0
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new AttachmentValidationError(
      `Unsupported file type "${mimeType}". Allowed: images (jpg, png, gif, webp), PDF, plain text.`
    )
  }
  if (sizeBytes > MAX_ATTACHMENT_BYTES) {
    const mb = (sizeBytes / 1024 / 1024).toFixed(1)
    throw new AttachmentValidationError(
      `File is ${mb} MB, which is over the ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB limit.`
    )
  }
  return { name: sanitizeName(opts.name), mimeType, sizeBytes }
}

function attachmentsDir(): Directory {
  return new Directory(Paths.document, 'attachments')
}

/** Test/export seam — exposed so unit tests don't have to touch RN modules. */
export function buildAttachmentFromCopy(opts: {
  name: string
  size: number
  mimeType: string | null
  sourceUri: string
}): Attachment {
  const validated = validatePickedFile({
    name: opts.name,
    size: opts.size,
    mimeType: opts.mimeType,
  })
  const dir = attachmentsDir()
  try {
    dir.create({ intermediates: true })
  } catch {
    // already exists or readonly — the move below will surface the real error
  }
  // prefix with a timestamp so two imports of the same name don't collide
  const stamped = `${Date.now().toString(36)}-${sanitizeName(validated.name)}`
  const dest = new File(dir, stamped)
  const source = new File(opts.sourceUri)
  try {
    source.move(dest)
  } catch {
    // copy as a fallback when the source lives outside our sandbox (e.g. a
    // SAF uri on Android that move() refuses to relocate)
    source.copy(dest)
  }
  return {
    name: validated.name,
    mimeType: validated.mimeType,
    sizeBytes: validated.sizeBytes,
    uri: dest.uri,
  }
}

/**
 * Open the system document picker, validate the user's choice, and copy it
 * into the app's attachments directory. Returns `null` if the user cancels.
 * Errors (unsupported type, oversize) surface as an alert and resolve null
 * so the caller doesn't have to wrap a try/catch.
 */
export async function pickAttachment(): Promise<Attachment | null> {
  let result: DocumentPicker.DocumentPickerResult
  try {
    result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
    })
  } catch (e: any) {
    Alert.alert('Could not open file picker', e?.message ?? 'Unknown error')
    return null
  }
  if (result.canceled || result.assets.length === 0) return null
  const asset = result.assets[0]
  try {
    return buildAttachmentFromCopy({
      name: asset.name,
      size: asset.size ?? 0,
      mimeType: asset.mimeType ?? null,
      sourceUri: asset.uri,
    })
  } catch (e: any) {
    Alert.alert('Attachment rejected', e?.message ?? 'Could not import this file.')
    return null
  }
}
