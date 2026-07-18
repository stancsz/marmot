/**
 * Minimal markdown parser for chat bubbles — headings, lists, fenced code,
 * inline bold/italic/code, and links. Pure and unit-tested; rendering lives
 * in components/MarkdownText. Deliberately not a full CommonMark parser:
 * small-model output uses a narrow, predictable subset.
 */

export type InlineToken =
  | { type: 'text'; content: string }
  | { type: 'bold'; content: string }
  | { type: 'italic'; content: string }
  | { type: 'code'; content: string }
  | { type: 'link'; content: string; href: string }

export type Block =
  | { type: 'paragraph'; inlines: InlineToken[] }
  | { type: 'heading'; level: 1 | 2 | 3; inlines: InlineToken[] }
  | { type: 'bullet'; inlines: InlineToken[] }
  | { type: 'ordered'; index: number; inlines: InlineToken[] }
  | { type: 'code'; language: string; content: string }

const INLINE_PATTERNS: { type: 'code' | 'bold' | 'italic' | 'link'; re: RegExp }[] = [
  { type: 'code', re: /`([^`]+)`/ },
  { type: 'bold', re: /\*\*([^*]+)\*\*/ },
  { type: 'italic', re: /\*([^*]+)\*/ },
  { type: 'link', re: /\[([^\]]+)\]\(([^)\s]+)\)/ },
]

export function parseInlines(text: string): InlineToken[] {
  const tokens: InlineToken[] = []
  let rest = text
  while (rest.length > 0) {
    let earliest: { type: (typeof INLINE_PATTERNS)[number]['type']; match: RegExpMatchArray } | null = null
    for (const { type, re } of INLINE_PATTERNS) {
      const match = rest.match(re)
      if (match && match.index !== undefined) {
        if (!earliest || match.index < earliest.match.index!) earliest = { type, match }
      }
    }
    if (!earliest) {
      tokens.push({ type: 'text', content: rest })
      break
    }
    const { type, match } = earliest
    if (match.index! > 0) tokens.push({ type: 'text', content: rest.slice(0, match.index!) })
    if (type === 'link') tokens.push({ type: 'link', content: match[1], href: match[2] })
    else tokens.push({ type, content: match[1] })
    rest = rest.slice(match.index! + match[0].length)
  }
  return tokens
}

export function parseMarkdown(text: string): Block[] {
  const blocks: Block[] = []
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let paragraph: string[] = []

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: 'paragraph', inlines: parseInlines(paragraph.join(' ').trim()) })
      paragraph = []
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const fence = line.match(/^```\s*(\S*)\s*$/)
    if (fence) {
      flushParagraph()
      const language = fence[1] ?? ''
      const body: string[] = []
      i++
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        body.push(lines[i])
        i++
      }
      // unterminated fence: everything to the end is code
      blocks.push({ type: 'code', language, content: body.join('\n') })
      continue
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      flushParagraph()
      blocks.push({
        type: 'heading',
        level: heading[1].length as 1 | 2 | 3,
        inlines: parseInlines(heading[2].trim()),
      })
      continue
    }

    const bullet = line.match(/^\s*[-*]\s+(.+)$/)
    if (bullet) {
      flushParagraph()
      blocks.push({ type: 'bullet', inlines: parseInlines(bullet[1].trim()) })
      continue
    }

    const ordered = line.match(/^\s*(\d+)[.)]\s+(.+)$/)
    if (ordered) {
      flushParagraph()
      blocks.push({ type: 'ordered', index: Number(ordered[1]), inlines: parseInlines(ordered[2].trim()) })
      continue
    }

    if (line.trim() === '') {
      flushParagraph()
      continue
    }

    paragraph.push(line.trim())
  }
  flushParagraph()
  return blocks
}
