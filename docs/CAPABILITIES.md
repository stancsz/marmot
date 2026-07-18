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

## Build order

1. ✅ Web research (no native deps)
2. ✅ Voice dictation + spoken replies (OS ASR/TTS)
3. ✅ Live conversation v1 (`VoiceSession` machine + Voice screen)
4. ✅ Meeting mode v1 (continuous transcript → RAG, wake-phrase suggest cards)
5. ✅ Repo import v1 (tarball → RAG)
6. ⬜ whisper.rn ASR upgrade + background audio (build-affecting)
7. ⬜ File organization (Android SAF, plan/approve/undo)
8. ⬜ isomorphic-git v2; neural TTS; diarization

Items 1–4 ship now; 5–8 are the standing roadmap with their mechanisms fixed
above so each is an implementation task, not a research task.
