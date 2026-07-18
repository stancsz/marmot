/** Pure agent core — no React Native imports, fully unit-testable. */

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** Anything that can complete a conversation (the app adapts LlamaEngine to this). */
export interface AgentLLM {
  complete(messages: LLMMessage[]): Promise<string>
}

export interface ToolDef {
  name: string
  description: string
  /** JSON-ish arg hints shown to the model */
  args: Record<string, string>
  run(args: Record<string, unknown>): Promise<string> | string
}

export interface AgentPolicies {
  /** hard cap on loop iterations */
  maxSteps: number
  /** tools the model may call; empty = none */
  allowedTools: string[]
  /** truncate tool observations to this many chars */
  maxObservationChars: number
}

export type AgentAction =
  | { action: 'tool'; tool: string; args: Record<string, unknown>; thought?: string; doneStep?: number }
  | { action: 'final'; answer: string; thought?: string; doneStep?: number }

export interface AgentStep {
  kind: 'thought' | 'tool_call' | 'observation' | 'final' | 'error' | 'plan_check' | 'subtask'
  content: string
  tool?: string
}

export interface AgentResult {
  answer: string
  steps: AgentStep[]
  /** true if the loop hit maxSteps without a final answer */
  truncated: boolean
}

export interface Skill {
  id: string
  /** trigger keywords — any match activates the skill */
  triggers: string[]
  /** "when problem X appears, execute procedure Y" */
  procedure: string
}

export type MemoryKind = 'user' | 'project' | 'episodic'

export interface MemoryEntry {
  id: string
  kind: MemoryKind
  text: string
  createdAt: number
  /** semantic vector, present once an embedder has seen this entry */
  embedding?: number[]
}

/** Minimal KV interface so the store works over AsyncStorage or a test map. */
export interface KVStore {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
}

export interface PlanStep {
  id: number
  text: string
  done: boolean
}

export interface Plan {
  steps: PlanStep[]
}

export interface JudgeVerdict {
  accept: boolean
  score: number // 0..10
  reasons: string
}

export interface Reflection {
  ok: boolean
  critique: string
  revisedAnswer?: string
}
