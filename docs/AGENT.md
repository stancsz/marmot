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
| System | `SYSTEM.md` execution kernel loaded by `CLAUDE.md`/`AGENTS.md`; in-app personas — named system prompts (5 built-ins + user-saved) applied to chat and injected into the agent loop and orchestrator | ✅ shipped, tested | repo root; Settings screen; `jest`: persona tests |
| Skills | `src/agent/skills.ts` — trigger → procedure registry (math, recall, writing, debugging) injected into the loop prompt | ✅ core, tested | `jest`: selection tests |
| Loops | `src/agent/loop.ts` — Observe→Decide→Act→Verify state machine with JSON action protocol, malformed-output recovery, honest truncation | ✅ core, tested | `jest`: 5 loop tests |
| Tools | Local tools (`calculator`, `datetime`, `search_chats`, `search_documents`), opt-in web tools, and **MCP client** (Streamable HTTP) — user-added servers contribute namespaced tools with a dynamically extended policy allowlist | ✅ core, tested | `jest`: tool + policy + MCP tests |
| Memory | `src/agent/memory.ts` — user/project/episodic entries over a KV store, keyword retrieval, prompt injection | ✅ core, tested | `jest`: memory tests |
| Planning | `src/agent/planner.ts` — plan → execute → update; JSON/numbered-list parsing, step tracking | ✅ core, tested | `jest`: planner tests |
| Reflection | `src/agent/reflection.ts` `reflect()` — self-critique with optional revision, fail-open on garbage | ✅ core, tested | `jest`: reflection tests |
| Judge | `src/agent/reflection.ts` `judge()` — independent accept/score verdict, fail-closed on garbage | ✅ core, tested | `jest`: judge tests |
| Context | Semantic memory retrieval + document RAG — llama.rn `embedding()` + cosine ranking with noise thresholds, lazy vector backfill, and keyword fallback; imported text/markdown files are chunked and searchable via the `search_documents` tool | ✅ core, tested | `jest`: semantic + documents tests |
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
- [ ] On-device E2E: run the agent loop against a real downloaded model on hardware; record results here **(blocked: needs a physical device — `npx expo run:android`)**

Agentic capabilities v2 (mechanisms fixed in [CAPABILITIES.md](CAPABILITIES.md)):

- [x] Web research: `web_search` + `fetch_page` tools (pure parsers, fixture-tested) behind the "Allow web access" policy switch; research skill cites sources
- [x] Voice — dictation entry, live conversation mode (`VoiceSession` state machine, tested: full loop, stop-mid-generation, LLM-failure fallback, barge-in), meeting transcription (continuous OS ASR v1 → transcript saved into document RAG) and wake-phrase contributor suggestions (`detectAddress`, tested)
- [x] Repo import v1: GitHub tarball → gunzip (pako) → pure ustar parser → text selection (README-first priority, per-file/total budgets, binary sniff) → one `repo:<owner>/<repo>` RAG document; inline import row in Memory → Documents
- [x] MCP client: `src/agent/mcp.ts` (JSON-RPC over Streamable HTTP; JSON + complete-SSE bodies; session ids; namespaced tool mapping — 7 tests) + Settings-managed server list with per-server enable/remove; tools registered per agent run with dynamic policy allowlist; dead servers skipped
- [x] P1+P2 Share-to-Marmot & quick text actions: expo-share-intent (Android SEND + iOS share extension via config plugin) routes shared text/URLs to the Quick-actions screen; 7 one-tap transforms (`textActions.ts`, pure prompt builders — tested for input embedding, truncation, option injection) + save-to-RAG; copy / use-as-input on results
- [x] P6 Deep research: 🔬 Research toggle (agent mode + web access) wraps the task via `buildResearchTask` (tested) — multi-angle searches, source fetches, cited synthesis through the existing orchestrator
- [x] P7 Automation: `marmot://ask?text=…` deep link (scheme + React Navigation linking) for iOS Shortcuts / Android automation
- [ ] whisper.rn ASR upgrade + background-audio entitlements (build-affecting)
- [ ] File organization: Android SAF grant, plan → approve → apply with undo journal
- [ ] isomorphic-git v2, neural TTS, diarization

Polish (post-roadmap):

- [x] Markdown rendering in assistant bubbles (`src/lib/markdown.ts` pure parser + `MarkdownText` themed renderer; headings, lists, fenced/inline code, bold/italic, tappable links)
- [x] Import a local `.gguf` from the Files app: "Import .gguf" in the model library copies the file into the models dir, validates size post-copy (providers may not report it), derives name/quant/id from the filename (pure, tested incl. collisions), and imported models are first-class — selectable in the chat strip, RAM-fit badged, deletable, engine-loaded via the same `modelPath`
- [x] Background downloads: iOS BACKGROUND download session pinned explicitly (platform default made a guarantee); "continues in background" hint on downloading cards; free-space refresh on app foreground; DownloadManager state machine now unit-tested with mocked native modules (init/done, orphan cleanup, atomic move, error, cancel-not-error, pause snapshot, remove-cancels-task)
- [x] CI: GitHub Actions runs typecheck, the full jest suite, and the Android Metro export on every push/PR to main (badge in README) — the Policies layer as mechanical enforcement
- [x] Document RAG: Memory → Documents imports text/markdown files; `chunkText` (paragraph-aware, overlap on hard splits) + `DocumentStore` (semantic retrieval, lazy backfill, keyword fallback, size caps) + `search_documents` agent tool with a grounding skill
- [x] Personas: 5 built-ins + save-current-prompt-as-persona (upsert by name, id collision handling — pure, tested); chips in Settings, long-press deletes customs; persona injected into the agent loop system prompt and orchestrator synthesis (tested)
- [x] Android GPU (experimental opt-in): Settings toggle → `engine.ensureLoaded` sends `n_gpu_layers: 99` on Android only when enabled; default stays CPU; flipping the toggle reloads the model (engine load-config now unit-tested via mocked llama.rn)
- [x] Chat import: Settings → Import chats picks a JSON export, validates it (`parseChatExport`), and merges by id (`mergeChats` — a stale backup never clobbers newer local history); confirm dialog shows added/updated/skipped counts

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
| 2026-07-18 | Chat import: `npm test` 56/56 (adds export round-trip parse, friendly rejection of non-JSON/foreign/future-version files, malformed chat+message dropping with valid ones kept, merge add/update/skip semantics, stale-backup protection, recency sort). `tsc` + Android export clean. UI evidence: split Export/Import buttons in `docs/assets/screen-settings.svg`. |
| 2026-07-18 | Markdown bubbles: `npm test` 64/64 (adds inline tokenizer tests incl. code-protects-markup, paragraph joining, heading/list parsing, fenced code verbatim + unterminated-fence safety, realistic reply end-to-end). `tsc` + Android export clean. UI evidence: bold/inline-code in `docs/assets/screen-chat.svg`. |
| 2026-07-18 | .gguf import: `npm test` 69/69 (adds name/quant/slug derivation, extension + min-size rejection, IQ-quant detection, id collision suffixing, hostile-filename survival). `tsc` + Android export clean. UI evidence: Import link + IMPORTED section in `docs/assets/screen-models.svg`. |
| 2026-07-18 | Background downloads: `npm test` 76/76 (adds 7 DownloadManager state-machine tests over mocked expo-file-system/AsyncStorage: init-done, orphan-.part cleanup, atomic move on completion, network-error state, cancel-ends-idle-not-error, pause-persists-snapshot + no-task no-op, remove-cancels-active-task). `tsc` + Android export clean. UI evidence: background hint in `docs/assets/screen-models.svg`. |
| 2026-07-18 | Document RAG: `npm test` 85/85 (adds chunker tests: single-chunk, paragraph packing, hard-split overlap math, CRLF/blank normalization; store tests: add/list/remove with chunk cleanup, empty/oversize rejection, zero-keyword-overlap semantic retrieval, keyword fallback; tool formatting tests). `tsc` clean. UI evidence: Documents section in `docs/assets/screen-memory.svg`. |
| 2026-07-18 | Productivity tranche (P1/P2/P6/P7): `npm test` 130/130 (adds text-action tests: unique ids + input embedding, truncation inside context budget, option injection with defaults, research-directive contents). `tsc` + Android export clean. UI evidence: `docs/assets/screen-ingest.svg`. Device-dependent: expo-share-intent native behavior (share sheet registration, iOS extension target at prebuild) untested until hardware run. |
| 2026-07-18 | MCP client: `npm test` 126/126 (adds parseMcpBody JSON/SSE/garbage, initialize→session-id adoption→tools/list flow, JSON-RPC error + HTTP failure surfacing, callTool text joining + isError flagging, tool namespacing/schema-hint mapping/run-through). `tsc` + Android export clean. Settings UI: MCP servers section (add/toggle/remove) — below the representative mockup's fold, not screenshotted. Live-server integration untested until hardware/network E2E. |
| 2026-07-18 | Repo import + voice redesign: `npm test` 119/119 (adds parseRepoUrl variants, tarball-URL building, ustar extraction on constructed archives, text/binary selection, README-first ordering, gzip round-trip with budget-skip accounting, friendly non-gzip rejection). `tsc` + Android export clean. Voice screen redesigned (gradient stage, animated orb/waveform, segmented control, REC timer, large-type transcript); UI evidence: reworked `docs/assets/screen-voice.svg`, repo row in `screen-memory.svg`. Note: GitHub Actions runs API returning empty for this repo (server-side anomaly); CI outcome for these pushes unverifiable at commit time. |
| 2026-07-18 | Capabilities tranche 1 (web + voice): `npm test` 111/111 (adds html stripping, DuckDuckGo fixture parsing incl. uddg redirects, search/fetch tool behavior + https guard + truncation; VoiceSession full loop, empty-input, stop-discards-reply, LLM-failure fallback, barge-in; detectAddress incl. ASR mishearings). `tsc` + Android export clean. Device-dependent pieces flagged: expo-speech-recognition behavior, echo/barge-in quality, meeting-session auto-restart cadence. UI evidence: `docs/assets/screen-voice.svg`. |
| 2026-07-18 | Android GPU toggle: `npm test` 98/98 (adds engine load-config tests over mocked llama.rn/react-native: Android CPU default, Android GPU opt-in, iOS-always-Metal, setting-flip reload vs same-config no-reload, context-length reload). `tsc` + Android export clean. UI evidence: switch rows in `docs/assets/screen-settings.svg`. Effectiveness on real Adreno hardware unverified — hence opt-in default-off. |
| 2026-07-18 | Personas: `npm test` 93/93 (adds validate/slug/upsert tests incl. case-insensitive update with stable id and built-in collision safety; loop persona-injection present/absent tests). `tsc` + Android export clean. UI evidence: persona chips in `docs/assets/screen-settings.svg`. |
| 2026-07-18 | CI live and green: run 29644718327 (49s) — tsc, 76/76 jest, Android Metro export on ubuntu. Took 4 attempts: npm ci's lock-completeness check fails on every platform due to jest 30's wasm resolver fallback pinning nested @emnapi deps npm never writes to the lock (reproduced locally with a freshly regenerated lock); CI reconciles via npm install from the same lockfile, and the one-off logo-tracing devDependencies (sharp/resvg/potrace/pixelmatch/pngjs) were removed from package.json. |
