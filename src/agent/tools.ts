import { Chat, ChatMessage } from '../types'
import { ToolDef } from './types'
import { evaluate } from './calculator'

/**
 * Built-in on-device tools. Everything runs locally — no network, in line
 * with Marmot's privacy model.
 */

export function calculatorTool(): ToolDef {
  return {
    name: 'calculator',
    description: 'Evaluate an arithmetic expression exactly (+ - * / % ^ and parentheses).',
    args: { expression: 'string, e.g. "(2+3)*4^2"' },
    run(args) {
      const expression = String(args.expression ?? '')
      if (!expression.trim()) return 'Error: empty expression'
      try {
        return String(evaluate(expression))
      } catch (e: any) {
        return `Error: ${e.message}`
      }
    },
  }
}

export function datetimeTool(now: () => Date = () => new Date()): ToolDef {
  return {
    name: 'datetime',
    description: 'Get the current local date and time.',
    args: {},
    run() {
      const d = now()
      return d.toLocaleString()
    },
  }
}

export function searchChatsTool(getChats: () => Promise<Chat[]>): ToolDef {
  return {
    name: 'search_chats',
    description: 'Keyword-search the user’s previous conversations on this device.',
    args: { query: 'string — keywords to look for' },
    async run(args) {
      const query = String(args.query ?? '').toLowerCase().trim()
      if (!query) return 'Error: empty query'
      const words = query.split(/\s+/)
      const chats = await getChats()
      const hits: { title: string; snippet: string; score: number }[] = []
      for (const chat of chats) {
        for (const m of chat.messages) {
          const text = m.content.toLowerCase()
          // count occurrences, not just presence — repeated hits rank higher
          const score = words.reduce((acc, w) => acc + countOccurrences(text, w), 0)
          if (score > 0) {
            hits.push({ title: chat.title, snippet: snippetAround(m, query), score })
          }
        }
      }
      hits.sort((a, b) => b.score - a.score)
      if (hits.length === 0) return 'No matches found.'
      return hits
        .slice(0, 5)
        .map((h) => `[${h.title}] ${h.snippet}`)
        .join('\n')
    },
  }
}

function countOccurrences(text: string, word: string): number {
  if (!word) return 0
  let count = 0
  let idx = text.indexOf(word)
  while (idx !== -1) {
    count++
    idx = text.indexOf(word, idx + word.length)
  }
  return count
}

function snippetAround(m: ChatMessage, query: string): string {
  const idx = m.content.toLowerCase().indexOf(query.split(/\s+/)[0])
  const start = Math.max(0, idx - 40)
  return m.content.slice(start, start + 160).replace(/\s+/g, ' ').trim()
}
