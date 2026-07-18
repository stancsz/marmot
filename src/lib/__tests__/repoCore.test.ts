import { gzip } from 'pako'
import {
  buildRepoDocument,
  extractRepoTarGz,
  isTextFile,
  parseRepoUrl,
  tarballUrl,
  untar,
} from '../repoCore'

describe('parseRepoUrl', () => {
  it('accepts owner/repo, GitHub URLs, tree branches, and #refs', () => {
    expect(parseRepoUrl('vercel/swr')).toEqual({ owner: 'vercel', repo: 'swr', ref: undefined })
    expect(parseRepoUrl('https://github.com/vercel/swr')).toEqual({ owner: 'vercel', repo: 'swr', ref: undefined })
    expect(parseRepoUrl('https://github.com/vercel/swr.git')).toEqual({ owner: 'vercel', repo: 'swr', ref: undefined })
    expect(parseRepoUrl('https://github.com/vercel/swr/tree/canary')).toEqual({ owner: 'vercel', repo: 'swr', ref: 'canary' })
    expect(parseRepoUrl('vercel/swr#v2')).toEqual({ owner: 'vercel', repo: 'swr', ref: 'v2' })
  })
  it('rejects garbage', () => {
    expect(() => parseRepoUrl('')).toThrow()
    expect(() => parseRepoUrl('not-a-repo')).toThrow('owner/repo')
  })
  it('builds the codeload tarball URL with HEAD default', () => {
    expect(tarballUrl(parseRepoUrl('a/b'))).toBe('https://codeload.github.com/a/b/tar.gz/HEAD')
    expect(tarballUrl(parseRepoUrl('a/b#main'))).toBe('https://codeload.github.com/a/b/tar.gz/main')
  })
})

/** build a minimal ustar archive for tests */
function makeTar(files: { path: string; content: string | Uint8Array; type?: string }[]): Uint8Array {
  const blocks: Uint8Array[] = []
  for (const f of files) {
    const data = typeof f.content === 'string' ? new TextEncoder().encode(f.content) : f.content
    const header = new Uint8Array(512)
    const writeStr = (s: string, off: number) => {
      for (let i = 0; i < s.length; i++) header[off + i] = s.charCodeAt(i)
    }
    writeStr(f.path, 0)
    writeStr('0000644', 100)
    writeStr(data.length.toString(8).padStart(11, '0'), 124)
    writeStr((f.type ?? '0'), 156)
    writeStr('ustar', 257)
    blocks.push(header)
    if ((f.type ?? '0') === '0' && data.length > 0) {
      const padded = new Uint8Array(Math.ceil(data.length / 512) * 512)
      padded.set(data)
      blocks.push(padded)
    }
  }
  blocks.push(new Uint8Array(1024)) // terminator
  const total = blocks.reduce((n, b) => n + b.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const b of blocks) {
    out.set(b, off)
    off += b.length
  }
  return out
}

describe('untar', () => {
  it('extracts regular files, skips directories, honors sizes', () => {
    const tar = makeTar([
      { path: 'repo-abc/', content: '', type: '5' },
      { path: 'repo-abc/README.md', content: '# Hello' },
      { path: 'repo-abc/src/index.ts', content: 'export const x = 1\n' },
    ])
    const entries = untar(tar)
    expect(entries.map((e) => e.path)).toEqual(['repo-abc/README.md', 'repo-abc/src/index.ts'])
    expect(new TextDecoder().decode(entries[0].data)).toBe('# Hello')
  })
})

describe('isTextFile', () => {
  it('accepts code/docs and special basenames, rejects binaries', () => {
    expect(isTextFile('src/app.tsx')).toBe(true)
    expect(isTextFile('LICENSE')).toBe(true)
    expect(isTextFile('Dockerfile')).toBe(true)
    expect(isTextFile('logo.png')).toBe(false)
    expect(isTextFile('model.gguf')).toBe(false)
  })
})

describe('buildRepoDocument / extractRepoTarGz', () => {
  it('strips the tarball prefix, puts READMEs first, tags files, skips binaries', () => {
    const tar = makeTar([
      { path: 'swr-abc123/src/main.ts', content: 'console.log("hi")' },
      { path: 'swr-abc123/README.md', content: '# SWR' },
      { path: 'swr-abc123/logo.png', content: 'PNGDATA' },
      { path: 'swr-abc123/data.json', content: new Uint8Array([0x7b, 0x00, 0x7d]) }, // binary-sniffed
    ])
    const doc = buildRepoDocument(untar(tar))
    expect(doc.fileCount).toBe(2)
    expect(doc.text.indexOf('### FILE: README.md')).toBe(0) // README leads
    expect(doc.text).toContain('### FILE: src/main.ts')
    expect(doc.text).not.toContain('logo.png')
    expect(doc.text).not.toContain('data.json')
  })

  it('round-trips a gzipped tarball and reports budget skips honestly', () => {
    const big = 'x'.repeat(55_000) // under the 60k per-file cap
    const tar = makeTar([
      { path: 'r-a/README.md', content: '# Title' },
      { path: 'r-a/big1.md', content: big },
      { path: 'r-a/big2.md', content: big },
      { path: 'r-a/big3.md', content: big },
      { path: 'r-a/big4.md', content: big }, // 4×55k + README > 190k total budget
    ])
    const doc = extractRepoTarGz(gzip(tar))
    expect(doc.fileCount).toBe(4)
    expect(doc.skipped).toBe(1)
    expect(doc.text).toContain('# Title')
  })

  it('rejects non-gzip bytes with a friendly error', () => {
    expect(() => extractRepoTarGz(new Uint8Array([1, 2, 3]))).toThrow('valid repository archive')
  })
})
