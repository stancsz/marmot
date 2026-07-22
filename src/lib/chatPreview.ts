import { visibleAnswer } from './thinking'
import { Block, InlineToken, parseMarkdown } from './markdown'
import type { ChatMessage } from '../types'

const DEFAULT_PREVIEW_LENGTH = 140

/**
 * Converts stored assistant/user content into a compact history preview.
 * Markdown is flattened through the same parser used by chat bubbles so list
 * markers, emphasis delimiters, links, and reasoning tags never leak into the
 * conversation list.
 */
export function chatPreview(
  content: string,
  maxLength = DEFAULT_PREVIEW_LENGTH,
  role?: ChatMessage['role']
): string {
  const visible = previewSource(content, role)
    .replace(/^\s*(?:#{1,3}\s*)?(?:thinking process|analysis|reasoning)\s*:\s*/i, '')
  const flattened = parseMarkdown(visible)
    .map(blockText)
    .join(' ')
    .replace(/[*_`~#]/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()

  if (!flattened) return ''
  if (flattened.length <= maxLength) return flattened
  const candidate = flattened.slice(0, Math.max(1, maxLength - 1)).trimEnd()
  const boundary = candidate.lastIndexOf(' ')
  const prefix = boundary > Math.floor(candidate.length * 0.55) ? candidate.slice(0, boundary) : candidate
  return `${prefix.trimEnd()}…`
}

function previewSource(content: string, role?: ChatMessage['role']): string {
  const parsed = visibleAnswer(content)
  const thinkingOnly = parsed === content.trim() && splitThinkingState(content)
  if (role === 'assistant' && thinkingOnly) return ''
  return parsed
}

function splitThinkingState(content: string): boolean {
  // Keep user-authored prompts intact, but never expose an assistant's
  // implicit reasoning scaffold in a history card when no answer followed.
  return /(?:thinking\s+process|analy[sz]e\s+the\s+request|^\s*(?:analysis|reasoning)\s*:)/i.test(content)
}

function blockText(block: Block): string {
  if (block.type === 'code') return block.content
  return block.inlines.map(inlineText).join('')
}

function inlineText(token: InlineToken): string {
  return token.content
}
