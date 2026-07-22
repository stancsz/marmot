/**
 * Zero-cost task tier classifier.
 *
 * Classifies a user message into one of three tiers using pure regex +
 * heuristics — no LLM call, no tokens spent. The tier drives:
 *   - which tools are injected into the prompt
 *   - the per-turn token budget
 *   - the maximum loop depth
 *   - whether a planning pass runs at all
 *
 * Tiers:
 *   quick    → direct single-pass answer; no agent loop; ≤256 tokens
 *   tool     → one specific tool; ≤2 loop steps; ≤512 tokens/step
 *   research → full loop; ≤4 steps; ≤768 tokens/step
 */

export type TaskTier = 'quick' | 'tool' | 'research'

export interface TierPolicy {
  tier: TaskTier
  /** per-turn max_tokens cap for agent turns */
  maxTokens: number
  /** maximum loop iterations (0 = no loop, direct answer) */
  maxSteps: number
  /** names of tools to inject; empty = no tools (direct answer) */
  toolFilter: ReadonlyArray<string>
}

// ---------------------------------------------------------------------------
// Keyword sets used for classification
// ---------------------------------------------------------------------------

/** Phrases that strongly signal web lookup is needed. */
const WEB_SIGNALS = [
  /\bsearch\b/i,
  /\blook up\b/i,
  /\bfind (out|me|information|info)\b/i,
  /\bwhat('?s| is) (the )?(latest|current|today'?s?|news)\b/i,
  /\bfetch\b/i,
  /\bweb\b/i,
  /\bonline\b/i,
  /\burl\b/i,
  /\bwebsite\b/i,
  /\bhttp\b/i,
]

/** Phrases that signal math / calculation. */
const CALC_SIGNALS = [
  /\bcalculate\b/i,
  /\bcompute\b/i,
  /\bmath\b/i,
  /\b\d+\s*[\+\-\*\/\^%]\s*\d+/,
  /\bwhat is \d/i,
  /\bhow many\b/i,
  /\bconvert\b/i,
  /\bpercent(age)?\b/i,
]

/** Phrases that signal file/document/memory access. */
const DOC_SIGNALS = [
  /\bmy (notes?|documents?|files?|memory|memories)\b/i,
  /\bprevious (chat|conversation|message)\b/i,
  /\bremember\b/i,
  /\bsearch (my|the) (chat|document|note|file)/i,
]

/** Connectors that suggest a multi-step task. */
const SEQUENTIAL_CONNECTORS =
  /\b(and then|then|and also|after that|first[,.]? then|step by step|summarize (and|then)|research and)\b/i

// ---------------------------------------------------------------------------
// Classification logic
// ---------------------------------------------------------------------------

function matches(patterns: RegExp[], text: string): boolean {
  return patterns.some((p) => p.test(text))
}

/**
 * Classify a user message into a {@link TaskTier}.
 *
 * @param task          The raw user message.
 * @param allowWeb      Whether the user has enabled web access in settings.
 * @returns The resolved tier label.
 */
export function classifyTask(task: string, allowWeb: boolean): TaskTier {
  const t = task.trim()

  // Research: long, multi-sentence, or contains explicit sequential connectors
  if (t.length > 120) return 'research'
  const sentences = t.split(/[.!?]\s+/).filter((s) => s.trim().length > 0)
  if (sentences.length > 2) return 'research'
  if (SEQUENTIAL_CONNECTORS.test(t)) return 'research'

  // Tool: keyword signals for specific tool categories
  if (allowWeb && matches(WEB_SIGNALS, t)) return 'tool'
  if (matches(CALC_SIGNALS, t)) return 'tool'
  if (matches(DOC_SIGNALS, t)) return 'tool'

  // Default: direct answer, no tools
  return 'quick'
}

// ---------------------------------------------------------------------------
// Tier → policy mapping
// ---------------------------------------------------------------------------

/**
 * Return the loop policy for a given tier and available tools.
 *
 * Tool injection is intentionally narrow:
 *   - quick  → no tools (avoids the loop overhead entirely)
 *   - tool   → only the most relevant subset for the detected signal
 *   - research → full tool list, bounded loop
 *
 * @param tier          The classified tier.
 * @param task          The original task (used to pick the right tool subset).
 * @param allowedTools  The full set of tool names available in this session.
 * @param allowWeb      Whether web tools are enabled.
 */
export function tierPolicy(
  tier: TaskTier,
  task: string,
  allowedTools: ReadonlyArray<string>,
  allowWeb: boolean
): TierPolicy {
  switch (tier) {
    case 'quick':
      return { tier, maxTokens: 256, maxSteps: 0, toolFilter: [] }

    case 'tool': {
      // Pick the single most relevant tool rather than injecting everything
      const tools: string[] = []
      if (allowWeb && matches(WEB_SIGNALS, task)) {
        tools.push('web_search', 'fetch_page')
      } else if (matches(CALC_SIGNALS, task)) {
        tools.push('calculator', 'datetime')
      } else if (matches(DOC_SIGNALS, task)) {
        tools.push('search_chats', 'search_documents')
      }
      // Intersect with what's actually available
      const filtered = tools.filter((n) => allowedTools.includes(n))
      return { tier, maxTokens: 512, maxSteps: 2, toolFilter: filtered }
    }

    case 'research':
      // Full tool list, but still bounded
      return {
        tier,
        maxTokens: 768,
        maxSteps: 4,
        toolFilter: [...allowedTools],
      }
  }
}
