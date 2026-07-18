import { parseInlines, parseMarkdown } from '../markdown'

describe('parseInlines', () => {
  it('tokenizes bold, italic, code, and links in order', () => {
    const tokens = parseInlines('use **bold** and *italic* and `code` and [docs](https://x.dev)')
    expect(tokens).toEqual([
      { type: 'text', content: 'use ' },
      { type: 'bold', content: 'bold' },
      { type: 'text', content: ' and ' },
      { type: 'italic', content: 'italic' },
      { type: 'text', content: ' and ' },
      { type: 'code', content: 'code' },
      { type: 'text', content: ' and ' },
      { type: 'link', content: 'docs', href: 'https://x.dev' },
    ])
  })

  it('does not confuse bold with italic and passes plain text through', () => {
    expect(parseInlines('**only bold**')).toEqual([{ type: 'bold', content: 'only bold' }])
    expect(parseInlines('no markup at all')).toEqual([{ type: 'text', content: 'no markup at all' }])
  })

  it('treats markup inside inline code as literal (code matched first)', () => {
    const tokens = parseInlines('run `npm i **not bold**` now')
    expect(tokens[1]).toEqual({ type: 'code', content: 'npm i **not bold**' })
  })
})

describe('parseMarkdown', () => {
  it('joins consecutive lines into paragraphs, splits on blanks', () => {
    const blocks = parseMarkdown('line one\nline two\n\nsecond para')
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toMatchObject({ type: 'paragraph' })
    expect((blocks[0] as any).inlines[0].content).toBe('line one line two')
  })

  it('parses headings, bullets, and ordered items', () => {
    const blocks = parseMarkdown('## Title\n- first\n* second\n1. one\n2) two')
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'bullet', 'bullet', 'ordered', 'ordered'])
    expect(blocks[0]).toMatchObject({ type: 'heading', level: 2 })
    expect(blocks[4]).toMatchObject({ type: 'ordered', index: 2 })
  })

  it('parses fenced code with language and preserves inner content verbatim', () => {
    const blocks = parseMarkdown('before\n```python\nprint("**hi**")\n\nx = 1\n```\nafter')
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'code', 'paragraph'])
    expect(blocks[1]).toEqual({
      type: 'code',
      language: 'python',
      content: 'print("**hi**")\n\nx = 1',
    })
  })

  it('treats an unterminated fence as code to the end (never loses text)', () => {
    const blocks = parseMarkdown('```\nconst x = 1\nconst y = 2')
    expect(blocks).toEqual([{ type: 'code', language: '', content: 'const x = 1\nconst y = 2' }])
  })

  it('handles a realistic small-model reply end to end', () => {
    const reply = [
      'Here are three ideas:',
      '',
      '1. **Bird feeder camera** — motion-triggered photos',
      '2. **Pi-hole** — network ad blocker',
      '',
      'Install with `curl -sSL https://install.pi-hole.net | bash`',
    ].join('\n')
    const blocks = parseMarkdown(reply)
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'ordered', 'ordered', 'paragraph'])
    expect((blocks[1] as any).inlines[0]).toEqual({ type: 'bold', content: 'Bird feeder camera' })
  })
})
