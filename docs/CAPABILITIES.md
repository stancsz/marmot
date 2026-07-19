# Agentic Capabilities — Engineering Design

Target hardware: 2026 flagships (12–16 GB RAM, Snapdragon 8 Gen 5 / A19-class
NPU, UFS4 storage). At that ceiling every capability below runs fully
on-device. Each capability is a **policy switch** (off by default) that
registers tools into the existing agent registry — the Policies layer we
already built is the gate.

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

## Everyday-productivity roadmap (v3)

What people actually rate assistants highly for, mapped to mechanisms:

| # | Feature | Mechanism | Effort |
| --- | --- | --- | --- |
| P1 | **Share-to-Marmot** — share any article/text from another app → summarize / save to RAG | Android `SEND` intent filters (config plugin) + iOS share extension (native target); routes into a new chat or Documents | M |
| P2 | **Quick text actions** — proofread, translate, tone-shift, TL;DR as one-tap chips on shared or pasted text | Prompt presets over the existing engine; chips UI on the share-ingest screen | S |
| P3 | **Vision** — photograph a whiteboard/receipt/document and ask about it | Gemma 4 E4B/E2B are multimodal; download the mmproj file alongside the GGUF, llama.rn multimodal completion; camera via expo-image-picker | M |
| P4 | **Calendar & reminders tools** — "add lunch with Sam Friday" fully on-device | expo-calendar as agent tools (`create_event`, `list_events`) behind a permission-gated policy switch | S |
| P5 | **Daily briefing / scheduled tasks** — a morning card from memory + docs (+ web if enabled) | expo-notifications + expo-background-task; orchestrator run persisted to a briefing chat | M |
| P6 | **Deep research mode** — multi-source cited reports, ChatGPT/Gemini-style | Preset over the existing orchestrator + web tools: fan out N queries → fetch → synthesize with citations + progress UI | S |
| P7 | **Shortcuts / automation hooks** — trigger Marmot from iOS Shortcuts & Android intents | `marmot://ask?text=…` deep link route (Expo linking) + x-callback response | S |
| P8 | **Projects** — group chats with pinned documents + a per-project persona (Claude Projects) | Chat gains `projectId`; project = persona + document subset filter over existing RAG | M |
| P9 | **Artifacts-lite** — render generated HTML/SVG/tables in a preview card | WebView (react-native-webview) sandboxed render of fenced html blocks | M |
| P10 | **Live interpreter** — two-way spoken translation | Voice stack + per-turn language toggle; Qwen models are strong multilingual | M |

Ordering rationale: P1/P2 capture the highest-frequency daily loop (text in
other apps → assistant), P3 unlocks the camera (the phone's superpower), and
P4–P7 turn Marmot from a destination app into ambient infrastructure.

## Build order

1. ✅ Web research (no native deps)
2. ✅ Voice dictation + spoken replies (OS ASR/TTS)
3. ✅ Live conversation v1 (`VoiceSession` machine + Voice screen)
4. ✅ Meeting mode v1 (continuous transcript → RAG, wake-phrase suggest cards)
5. ✅ Repo import v1 (tarball → RAG)
6. ✅ MCP client (Streamable HTTP, Settings-managed servers)
7. ⬜ whisper.rn ASR upgrade + background audio (build-affecting)
8. ⬜ File organization (Android SAF, plan/approve/undo)
9. ⬜ isomorphic-git v2; neural TTS; diarization
10. ⬜ Everyday-productivity roadmap P1–P10 above

Items 1–4 ship now; 5–8 are the standing roadmap with their mechanisms fixed
above so each is an implementation task, not a research task.
