# Marmot Agent Architecture

Marmot is growing from a chat app into an on-device agent. This document maps
the frontier-agent layer model onto Marmot, records what is **real and
tested** versus planned, and is the working state for the improvement loop:
each iteration picks the next unchecked item, implements it, tests it,
documents it, screenshots any UI change, and commits.

Everything here must stay honest: a layer is only marked shipped when there is
runnable evidence (tests or an on-device screenshot).

## Layer map

| Layer | Marmot implementation | Status | Evidence |
| --- | --- | --- | --- |
| System | `SYSTEM.md` execution kernel loaded by `CLAUDE.md`/`AGENTS.md`; in-app system prompt setting | ✅ shipped | repo root; Settings screen |
| Skills | `src/agent/skills.ts` — trigger → procedure registry (math, recall, writing, debugging) injected into the loop prompt | ✅ core, tested | `jest`: selection tests |
| Loops | `src/agent/loop.ts` — Observe→Decide→Act→Verify state machine with JSON action protocol, malformed-output recovery, honest truncation | ✅ core, tested | `jest`: 5 loop tests |
| Tools | `src/agent/tools.ts` — local tools: `calculator` (safe parser), `datetime`, `search_chats`; policy allowlist enforced | ✅ core, tested | `jest`: tool + policy tests |
| Memory | `src/agent/memory.ts` — user/project/episodic entries over a KV store, keyword retrieval, prompt injection | ✅ core, tested | `jest`: memory tests |
| Planning | `src/agent/planner.ts` — plan → execute → update; JSON/numbered-list parsing, step tracking | ✅ core, tested | `jest`: planner tests |
| Reflection | `src/agent/reflection.ts` `reflect()` — self-critique with optional revision, fail-open on garbage | ✅ core, tested | `jest`: reflection tests |
| Judge | `src/agent/reflection.ts` `judge()` — independent accept/score verdict, fail-closed on garbage | ✅ core, tested | `jest`: judge tests |
| Context | Semantic memory retrieval — llama.rn `embedding()` + cosine ranking with a noise threshold, lazy vector backfill, and keyword fallback when no model is loaded; `search_chats` stays keyword | ✅ core, tested | `jest`: semantic tests |
| Policies | `src/agent/types.ts` `AgentPolicies` — maxSteps, tool allowlist, observation caps | ✅ core, tested | `jest`: policy tests |
| Subagents | `runOrchestratedTask` — one fresh-context executor per plan step (own budget, sees only completed-step summaries), synthesizer, judge gate with one bounded retry; deterministic plan check-offs | ✅ core, tested | `jest`: orchestrator tests |

`✅ core, tested` = the logic is implemented as pure TypeScript with passing
unit tests (`npm test`, 24 tests). **The UI wiring for Agent Mode is not
shipped yet** — that is the next item.

## Loop iteration protocol

One intentional increment per iteration (per SYSTEM.md):

1. Read this file; pick the first unchecked item below.
2. Implement it for real — no stubs presented as features.
3. Test it (`npm test` for core; on-device or mockup evidence for UI).
4. Update this file and README; regenerate screenshots if UI changed.
5. Commit and push.

## Roadmap

- [x] Agent core: loop, tools, policies, planner, skills, memory, reflection, judge (pure TS + 24 unit tests)
- [x] Wire Agent Mode into ChatScreen: ⚙ Agent toggle chip, engine adapter (`src/lib/agentRuntime.ts`), cancellable LLM wrapper (tested), live thought/tool/observation timeline, `screen-agent.svg` mockup
- [x] Memory UI: `MemoryScreen` (Settings → Manage memory) with add/delete grouped by kind; deterministic episodic auto-capture after every exchange (`episodicSummary`, tested) with a 50-entry cap (tested)
- [x] Plan panel: `shouldPlan` gates a planner round-trip for multi-step tasks; the plan is injected into the loop prompt and the model reports completions via `done_step` in its JSON, driving live ☑ check-offs in the chat UI (protocol + gating tested)
- [x] Reflection/judge toggle: "Verify answers" switch in Settings runs `verifyAnswer` (reflect may revise → judge scores the survivor) after each agent reply; verdict badge (✓/⚠ score, revised flag) persists on the message; best-effort — a failed pass never loses the answer
- [x] Semantic memory: `Embedder` interface + cosine retrieval (threshold 0.25) in MemoryStore; `engine.embedText` adapter over llama.rn `embedding()`; lazy backfill (≤5/retrieve) for entries stored while no model was loaded; graceful keyword fallback — all tested with a deterministic fake embedder
- [x] Subagent orchestration: planner → per-step fresh-context executors (`EXECUTOR_MAX_STEPS` budget each, summaries-only context) → synthesizer → judge gate (tied to Verify answers, one bounded retry with judge feedback); ▶ subtask headers in the timeline; wired as the default path for multi-step agent tasks
- [ ] On-device E2E: run the agent loop against a real downloaded model on hardware; record results here
- [ ] Chat import (restores JSON exports)

## Verification log

| Date | Evidence |
| --- | --- |
| 2026-07-18 | `npm test`: 2 suites, 24/24 passed (loop, tools, policies, planner, skills, memory, reflection, judge, JSON extraction, calculator). `npx tsc --noEmit` clean. |
| 2026-07-18 | Agent Mode UI wired: `npm test` 27/27 (adds cancellable-LLM tests: pass-through, abort-before-dispatch, discard-late-reply). `tsc` + Android export clean. UI evidence: `docs/assets/screen-agent.svg` (design mockup — on-device screenshot still owed by the hardware E2E item). |
| 2026-07-18 | Memory UI + episodic capture: `npm test` 29/29 (adds episodicSummary clipping test and EPISODIC_CAP pruning test). `tsc` + Android export clean. UI evidence: `docs/assets/screen-memory.svg`. |
| 2026-07-18 | Plan panel: `npm test` 34/34 (adds plan-prompt injection, plan_check emission, out-of-plan done_step rejection, done_step snake/camel parsing, shouldPlan gating). `tsc` + Android export clean. UI evidence: updated `docs/assets/screen-agent.svg` with the live plan panel. |
| 2026-07-18 | Verify answers: `npm test` 38/38 (adds verifyAnswer tests: pass-through, revision-adopted-and-judged, judge rejection surfaced, empty revision ignored). `tsc` + Android export clean. UI evidence: verified badge in `docs/assets/screen-agent.svg`. |
| 2026-07-18 | Semantic memory: `npm test` 44/44 (adds cosine edge cases, meaning-based retrieval with zero keyword overlap, noise-threshold filtering, persisted lazy backfill, keyword fallback when embedder down). `tsc` + Android export clean. Caveat: `engine.embedText` over llama.rn `embedding()` returns null-safe fallback; whether chat-tuned GGUFs produce useful embeddings on-device is unverified until the hardware E2E item. |
| 2026-07-18 | Subagent orchestration: `npm test` 49/49 (adds per-step execution with summary-forwarding, judge-gate reject→retry with feedback, accept passthrough, executor-budget behavior, degenerate-plan fallback). `tsc` + Android export clean. UI evidence: `docs/assets/screen-agent.svg` reworked with ▶ subtask executor sections. |
