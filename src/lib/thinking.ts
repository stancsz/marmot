/**
 * Some models (Qwen3.5, SmolLM3) emit <think>...</think> reasoning before the
 * answer — occasionally more than one block. Split streamed text into the
 * hidden reasoning and the visible answer, tolerating multiple blocks and a
 * still-open trailing block while streaming.
 */
export function splitThinking(text: string): {
  thinking: string
  answer: string
  isThinking: boolean
} {
  let thinking = ''
  let answer = ''
  let rest = text
  let isThinking = false

  // Some chat templates (Qwen3.5) put the opening <think> inside the prompt,
  // so the stream contains only a closing tag: everything before </think>
  // is reasoning. (Found in emulator E2E.)
  if (!rest.includes('<think>') && rest.includes('</think>')) {
    const close = rest.indexOf('</think>')
    return {
      thinking: rest.slice(0, close).trim(),
      answer: rest.slice(close + 8).trim(),
      isThinking: false,
    }
  }
  if (!rest.includes('<think>') && looksLikeOpenReasoning(rest)) {
    // stream still inside an implicit think block — no closing tag yet
    return { thinking: rest.trim(), answer: '', isThinking: true }
  }

  for (;;) {
    const open = rest.indexOf('<think>')
    if (open === -1) {
      answer += rest
      break
    }
    answer += rest.slice(0, open)
    const afterOpen = rest.slice(open + 7)
    const close = afterOpen.indexOf('</think>')
    if (close === -1) {
      thinking += afterOpen
      isThinking = true
      break
    }
    thinking += afterOpen.slice(0, close)
    rest = afterOpen.slice(close + 8)
  }

  return { thinking, answer: answer.trim(), isThinking }
}

/**
 * The answer with reasoning stripped, for one-shot consumers (voice replies,
 * quick actions, agent turns) that must never surface think-blocks. Falls
 * back to the raw text when the model spent its whole budget thinking —
 * better than returning nothing.
 */
export function visibleAnswer(text: string): string {
  return splitThinking(text).answer || text.trim()
}

/**
 * Heuristic for implicit reasoning streams (no tags emitted yet): Qwen3.5
 * reasoning openers. Conservative — only matches known prefixes so normal
 * answers are never hidden.
 */
function looksLikeOpenReasoning(text: string): boolean {
  // tolerate markdown decoration around the opener (**Thinking Process:**,
  // ### Thinking — the model varies its header, seen live in emulator E2E)
  return /^[#*_\s]*(Thinking|Okay, |Let's think|We need to|The user)/.test(text.trimStart())
}
