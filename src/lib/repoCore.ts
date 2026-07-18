import { ungzip } from 'pako'

/**
 * Repo import v1 (pure core): GitHub tarball → gunzip → ustar parse →
 * text-file selection under a budget → one RAG document. Networking and
 * storage live in repoImport.ts.
 */

export interface RepoSpec {
  owner: string
  repo: string
  ref?: string
}

export function parseRepoUrl(input: string): RepoSpec {
  let s = input.trim()
  if (!s) throw new Error('Enter a repository like owner/repo.')
  let ref: string | undefined
  const hash = s.indexOf('#')
  if (hash !== -1) {
    ref = s.slice(hash + 1).trim() || undefined
    s = s.slice(0, hash)
  }
  s = s.replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\.git$/i, '')
  const tree = s.match(/^([^/]+)\/([^/]+)\/tree\/(.+)$/)
  if (tree) return { owner: tree[1], repo: tree[2], ref: ref ?? tree[3] }
  const plain = s.match(/^([^/]+)\/([^/]+)\/?$/)
  if (!plain) throw new Error('Could not parse that repository. Use owner/repo or a GitHub URL.')
  return { owner: plain[1], repo: plain[2], ref }
}

export function tarballUrl(spec: RepoSpec): string {
  return `https://codeload.github.com/${spec.owner}/${spec.repo}/tar.gz/${spec.ref ?? 'HEAD'}`
}

export interface TarEntry {
  path: string
  data: Uint8Array
}

function blockString(bytes: Uint8Array, offset: number, length: number): string {
  let end = offset
  while (end < offset + length && bytes[end] !== 0) end++
  let out = ''
  for (let i = offset; i < end; i++) out += String.fromCharCode(bytes[i])
  return out
}

/** minimal ustar reader — regular files only, checksum not enforced */
export function untar(bytes: Uint8Array): TarEntry[] {
  const entries: TarEntry[] = []
  let offset = 0
  while (offset + 512 <= bytes.length) {
    const name = blockString(bytes, offset, 100)
    if (!name) break // two zero blocks end the archive
    const size = parseInt(blockString(bytes, offset + 124, 12).trim() || '0', 8)
    const type = String.fromCharCode(bytes[offset + 156])
    const prefix = blockString(bytes, offset + 345, 155)
    const path = prefix ? `${prefix}/${name}` : name
    const dataStart = offset + 512
    if ((type === '0' || type === '\0' || type === '') && size > 0) {
      entries.push({ path, data: bytes.slice(dataStart, dataStart + size) })
    }
    offset = dataStart + Math.ceil(size / 512) * 512
  }
  return entries
}

const TEXT_EXTENSIONS = new Set([
  'md', 'txt', 'rst', 'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'py',
  'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'h', 'cpp', 'hpp', 'cs',
  'sh', 'bash', 'yml', 'yaml', 'toml', 'ini', 'cfg', 'css', 'scss', 'html',
  'sql', 'graphql', 'proto', 'gradle', 'properties', 'ex', 'exs', 'php',
])
const TEXT_BASENAMES = new Set(['readme', 'license', 'dockerfile', 'makefile', 'changelog'])

export function isTextFile(path: string): boolean {
  const base = path.split('/').pop() ?? ''
  const lower = base.toLowerCase()
  if (TEXT_BASENAMES.has(lower) || TEXT_BASENAMES.has(lower.split('.')[0])) return true
  const ext = lower.includes('.') ? lower.split('.').pop()! : ''
  return TEXT_EXTENSIONS.has(ext)
}

export function utf8Decode(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes)
  // minimal fallback decoder
  let out = ''
  let i = 0
  while (i < bytes.length) {
    const b = bytes[i]
    if (b < 0x80) {
      out += String.fromCharCode(b)
      i++
    } else if (b < 0xe0) {
      out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f))
      i += 2
    } else if (b < 0xf0) {
      out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f))
      i += 3
    } else {
      const cp =
        ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f)
      out += String.fromCodePoint(cp)
      i += 4
    }
  }
  return out
}

export interface RepoDocument {
  text: string
  fileCount: number
  skipped: number
}

const MAX_FILE_BYTES = 60_000
const MAX_TOTAL_CHARS = 190_000

/**
 * Select and concatenate text files into one RAG document. READMEs and docs
 * come first so the budget favors explanation over code when it runs out.
 */
export function buildRepoDocument(entries: TarEntry[]): RepoDocument {
  const files = entries
    // tarballs prefix every path with "<repo>-<sha>/"
    .map((e) => ({ ...e, path: e.path.split('/').slice(1).join('/') }))
    .filter((e) => e.path && isTextFile(e.path))
    .filter((e) => e.data.length <= MAX_FILE_BYTES)
    .filter((e) => !e.data.slice(0, 1000).includes(0)) // binary sniff
    .sort((a, b) => priority(a.path) - priority(b.path) || a.path.localeCompare(b.path))

  let text = ''
  let fileCount = 0
  let skipped = 0
  for (const file of files) {
    const body = utf8Decode(file.data).trim()
    if (!body) continue
    const section = `### FILE: ${file.path}\n\n${body}\n\n`
    if (text.length + section.length > MAX_TOTAL_CHARS) {
      skipped++
      continue
    }
    text += section
    fileCount++
  }
  return { text: text.trim(), fileCount, skipped }
}

function priority(path: string): number {
  const lower = path.toLowerCase()
  if (lower.startsWith('readme')) return 0
  if (lower.endsWith('.md') || lower.endsWith('.rst') || lower.endsWith('.txt')) return 1
  return 2
}

/** full pure pipeline: tar.gz bytes → repo document */
export function extractRepoTarGz(tarGz: Uint8Array): RepoDocument {
  let tarBytes: Uint8Array
  try {
    tarBytes = ungzip(tarGz)
  } catch {
    throw new Error('That download was not a valid repository archive.')
  }
  return buildRepoDocument(untar(tarBytes))
}
