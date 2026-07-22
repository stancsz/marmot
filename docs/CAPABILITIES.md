# Agentic Capabilities — Engineering Design

## Product direction (July 2026)

Marmot's next product priority is an **E4B-first private phone assistant**, not
another general chat surface. The north-star loop is:

> **Share something → understand it locally → propose the next action → get
> explicit approval → execute it on the phone.**

On devices that can run Gemma 4 E4B, the app should make multimodal input,
personal context, and reliable phone actions visible immediately. The model
proposes and explains; deterministic application code handles dates, tools,
permissions, and writes. Existing web, MCP, repo, and autonomous-agent work
remains available as Labs, but is not the next primary product investment.

Target hardware: 2026 flagships (12–16 GB RAM, Snapdragon 8 Gen 5 / A19-class
NPU, UFS4 storage). At that ceiling every capability below runs fully
on-device. Each capability is a **policy switch** (off by default) that
registers tools into the existing agent registry — the Policies layer we
already built is the gate.

### Shipped interaction foundation

The chat surface is now a deliberate foundation for the E4B/share-to-action
loop: semantic platform icons replace emoji controls, primary actions use
accessible 44pt targets, state changes use fluid motion, history previews
flatten Markdown and hide reasoning scaffolds, model choice uses a metadata
dropdown, and chat history is organized in a searchable left drawer. This is
not a separate product phase; it is the interaction quality bar required by
P0–P2.

## Small-model product strategy

Marmot's local models should be used for bounded, high-frequency transformations
where privacy, offline availability, and response speed matter more than broad
cloud-scale knowledge. The app owns the structure around the model: task cards
keep prompts short, retrieval supplies local facts, deterministic code parses
dates and actions, and every phone write remains previewed and approval-gated.

The highest-ROI product sequence is:

1. **Share to outcome:** screenshot or receipt to extracted facts and a typed
   calendar/reminder/reply/save preview. This is the acquisition wedge because
   the transformation is visible and easy to forward.
2. **Flight mode:** an explicitly offline session with bounded activities such
   as language practice, explain-this, trip planning from saved content,
   lightweight games, story continuation, and reflective check-ins. Short
   turns, current-session memory, and Continue/Finish controls make a small
   model feel responsive without requiring a subscription.
3. **Private daily context:** opt-in local projects, memories, and saved
   artifacts that make responses personal while keeping the source data on the
   phone.

Optimize these bets against useful-result latency, accepted-output rate, edit
rate, share/forward rate, offline completion, and unapproved-write count.
Larger models and provider connectors are fallback capacity, not the product
thesis.

### Flight mode and companion guardrails

Flight mode is the retention wedge for a small local model: an entry point with
bounded activities such as language practice, trip planning from saved content,
light games, story continuation, and reflective check-ins. It must remain
useful with airplane mode enabled, keep turns short, and make the current
session boundary visible.

The digital-pet layer is opt-in and user-controlled. It may keep a small local
persona state and shared milestones, but it must not silently run an unrestricted
background agent. Notifications, memory retention, and milestone saving are
separate settings; every background operation has a battery and privacy budget.

## Memory & concurrency budget (16 GB flagship)

| Resident component | Model | RAM |
| --- | --- | --- |
| Chat/agent LLM | Qwen3.5 2B–4B Q4 | 1.3–2.7 GB |
| ASR | whisper-base int8 (whisper.rn) | ~150 MB |
| Embedder (optional dedicated) | bge-small-class GGUF | ~130 MB |
| TTS v2 (optional neural) | Piper / Kokoro-82M ONNX | ~100 MB |

All four coexist under 3.2 GB — comfortable on 12 GB+. Today `engine.ts` owns
one llama context; the enabler is an **EngineManager** with named slots
(`chat`, `asr`, `embed`) so contexts load/unload independently.

## 1. Live conversation mode (ChatGPT-voice style)

**Loop:** mic → streaming ASR → VAD endpointing (≈700 ms trailing silence) →
LLM stream → sentence-splitter → TTS per sentence (pipelined) → back to
listening. **Barge-in:** mic stays open during playback with platform echo
cancellation; VAD speech during TTS ⇒ stop TTS + `engine.stop()`.

**Latency budget (flagship, 2B model):** ASR final 0.2 s + prefill 0.3–0.8 s +
first sentence 0.5 s + TTS start 0.2 s ≈ **1.2–1.7 s to first audio** —
competitive with cloud assistants.

**v1 (ships first):** OS ASR (`expo-speech-recognition`) + OS TTS
(`expo-speech`), pure-TS `VoiceSession` state machine
(idle→listening→thinking→speaking, tested). **v2:** whisper.rn streaming ASR +
neural TTS; state machine unchanged.

## 2. Voice input (dictation)

Subset of #1: mic button on the chat input → one-shot recognition → text into
the input field. OS ASR v1; whisper.rn v2 for offline-guaranteed dictation.

## 3. Meeting transcription

whisper.rn realtime (30 s sliding windows, VAD-segmented) on efficiency
cores/NPU (CoreML encoder on iOS) — whisper-base int8 is faster than realtime
on target hardware; ≈5–8% battery per meeting hour. Requires background-audio
entitlement (iOS `UIBackgroundModes: audio`) and an Android foreground service
— build-affecting config, flagged in app.json when v2 lands.

**Output path reuses what exists:** rolling transcript → saved into document
RAG (chunked, searchable) → orchestrator produces summary + action items.
v1 ships with continuous OS ASR (auto-restarting sessions); v2 swaps the ASR.
Diarization (speaker labels) is v3: segmentation-embedding clustering, ONNX.

## 4. Meeting participation (contributor / assistant)

Transcription pipeline + **address detection** on the live transcript:
wake-phrase v1 ("marmot …", fuzzy match, pure-tested), openWakeWord ONNX v2.
When addressed: context = recent transcript turns + document RAG → short
contribution. **Suggest mode is the default** — the reply appears as a card
the user taps to speak aloud (TTS); auto-speak is a separate opt-in. Silent
contributions: a running decisions/action-items panel refreshed by the agent.

## 5. Web research

`web_search` (DuckDuckGo HTML endpoint, no key) + `fetch_page`
(Readability-style text extraction) as agent tools behind an **Allow web
access** policy switch (off = provably offline). Multi-hop research =
existing orchestrator: plan → search → fetch → synthesize with citations.
Parsers are pure and fixture-tested; fetchers injected.

## 6. Git repositories

**v1 — repo import:** tarball download (`codeload.github.com/<o>/<r>/tar.gz/<ref>`)
→ gunzip (pako, pure JS) → untar (pure JS) → text files chunked into document
RAG → "chat with the repo" via `search_documents`. Private repos: PAT header.
Fully fixture-testable.

**v2 — true git:** isomorphic-git (pure-JS) over an expo-file-system adapter:
shallow clone, log, branch, diff — and write ops (commit/push), which lets the
agent patch code from the phone. Needs Buffer/stream polyfills; proven
feasible on RN.

## 7. Organizing phone files

**Android (full capability):** Storage Access Framework directory grant
(expo-file-system SAF) → tools `list_files`, `propose_organization`,
`apply_moves`. **iOS:** Photos organization via `expo-media-library`; folder
scope limited to picked directories (needs a small native module for
security-scoped directory bookmarks).

**Safety pattern (policy invariant):** read-only reconnaissance → plan card
("34 screenshots → /Screenshots, 12 PDFs → /Receipts") → explicit Apply →
execution with an **undo journal**. The agent never moves a file without an
approved plan.

## 8. MCP — the universal tool interface

Marmot is an **MCP client over Streamable HTTP** (phones can't spawn stdio
servers, but they can speak JSON-RPC to HTTP servers on the LAN or the
internet). Users add servers in Settings; each server's tools are fetched
(`initialize` → `tools/list`), namespaced `mcp_<server>_<tool>`, registered
into the agent, and the policy allowlist extends to exactly what connected
servers expose. Per-server failures are skipped, tool lists cached ~5 min.
v1 handles JSON and complete-SSE response bodies; live streaming
subscriptions, resources, and prompts are follow-ups. This one protocol is
the bridge to Home Assistant, company tools, personal servers — anything.

## E4B-first product roadmap

This is the product priority order. It does not invalidate already-built
engineering capabilities; it determines what the user should experience first.

| Phase | Product outcome | Main mechanisms | Effort |
| --- | --- | --- | --- |
| **P0 — E4B unlock** | An E4B-capable user immediately understands what the phone can do locally | Device-fit detection, recommended E4B model, multimodal model card, speed/RAM/battery expectations, first-run real-content demo, offline/airplane-mode proof | M |
| **P1 — Share to action** | Any shared message, article, screenshot, or document becomes useful in one step | Android `SEND` intent + iOS share extension, action presets, structured result cards, copy/save/share/draft actions | M |
| **P2 — Phone actions** | Marmot turns understanding into safe phone operations | Calendar, reminders, contacts, SMS/email compose, typed action schemas, preview/approve/undo flow | M |
| **P3 — Personal context** | Marmot answers grounded questions about the user's life and work | Permission hub, projects, local document/memory retrieval, source links, preference-aware drafting | M |
| **P4 — E4B multimodal utility** | The camera and microphone become private input devices | Screenshot/receipt/document extraction, voice notes, transcription, decisions, action items, reminders | M |
| **P5 — One provider connector** | Marmot helps triage one real inbox without sending data to an AI server | Gmail or Outlook OAuth, read-only search, thread summaries, deadline extraction, draft replies; no auto-send initially | L |
| **P6 — Daily habit** | Marmot becomes useful before the user opens another app | Morning agenda card, pending actions, saved items, recent shared content, optional local notifications | M |
| **Labs** | Advanced capabilities for power users, not the core onboarding | Web research, MCP, repo agent, file organization, live meeting participation, deep research, broad automation | Existing / later |

The flagship demonstration is:

> **Share a screenshot or message → E4B extracts the meaning → Marmot offers a
> calendar event, reminder, reply, or saved memory.**

This is where Marmot can compete with cloud assistants on outcome, privacy,
latency, and phone context without claiming general-model parity.

## Build order

Current status split for the multimodal milestone: local screenshot/image
grounding is shipped through SmolVLM 256M plus its paired projector. PDF/audio
decoding remains open. Flight mode now ships as a bounded, user-invoked local
session with five activities and no background work. The next implementation
order is image facts to typed action previews, then explicit companion
milestone saves and optional notifications.

1. [x] E4B device-fit path, model recommendation, and first-run offline demo
2. [x] Native Share-to-Marmot intake and structured action cards
3. [x] Local text/Markdown attachments with bounded, untrusted reference grounding
4. [x] E4B multimodal attachments: screenshot/image grounding is shipped; PDF and short audio input remain open
5. [x] Calendar event action with explicit approval, local-calendar fallback, and undo
6. [ ] Reminders, contacts, and compose actions with approval/undo
7. [ ] Personal context: projects, permission hub, grounded sources, local retrieval
8. [ ] Voice notes → transcript → decisions/action items → reminders
9. [ ] Validate the core loop on real hardware, then add one email provider
10. [x] Bounded Flight mode MVP with a local-only proof and stop path
11. [ ] Companion milestones, optional notifications, and daily briefing with explicit consent
12. [ ] Keep web, MCP, repo, file organization, live meeting, and deep research
   capabilities in Labs until the core loop meets its quality bar

The quality bar for moving a capability out of Labs is measured on real phone
tasks: useful-result latency, accepted-output rate, edit rate, groundedness,
action completion, battery cost, and zero unapproved writes.

Previously shipped capabilities remain supported and regression-tested, but the
next user-facing investment follows the E4B-first product roadmap above.
