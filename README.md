<p align="center">
  <img src="docs/assets/logo.svg" alt="Marmot logo" width="180" />
</p>

<h3 align="center">Marmot</h3>

<p align="center">
  <b>Share to action, privately on your phone.</b><br/>
  Understand screenshots, receipts, messages, and documents locally.<br/>
  No account, no cloud, no telemetry — works in airplane mode.
</p>

<p align="center">
  <a href="https://stancsz.github.io/marmot/"><b>stancsz.github.io/marmot</b></a>
</p>

<p align="center">
  <a href="https://github.com/stancsz/marmot/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/stancsz/marmot/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-E8A33D.svg" /></a>
  <img alt="Platforms" src="https://img.shields.io/badge/platform-iOS%20%7C%20Android-0D1117.svg" />
  <img alt="Powered by llama.cpp" src="https://img.shields.io/badge/inference-llama.cpp-3FB950.svg" />
  <a href="#contributing"><img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-2F81F7.svg" /></a>
</p>

---

## The flagship loop

Share something → understand it locally → propose the next action → approve and execute it on the phone.
Marmot turns a screenshot, receipt, message, or document into an editable
preview for a calendar event, reminder, draft reply, or saved note. Nothing is
written or sent until you approve it.

> share something → understand it locally → propose the next action → approve and execute it on the phone

The canonical repository is [github.com/stancsz/marmot](https://github.com/stancsz/marmot).
The older `super-marmot/marmot` parent is not a publishing target; releases,
issues, Discussions, and store metadata are maintained from this repository.

Start with the flagship path: share a screenshot or message, let the local
model propose a calendar action, review the resolved time, and approve or undo
the phone-side write. The Android proof run is recorded in
[the flagship verification log](docs/verification/flagship-share-vertical-2026-07-22.md).
See the [sanitized before/after examples](docs/EXAMPLES.md) for verified
calendar, offline travel, safe screenshot rejection, and the current draft
reply quality gate.

## What is Marmot?

Marmot is a lightweight iOS + Android app that does for phones what
[Ollama](https://ollama.com) does for laptops: pick a model from a curated
library, download it once, and chat with it locally. Inference runs on your
device with [llama.cpp](https://github.com/ggml-org/llama.cpp) — Metal-accelerated
on iOS, ARM-optimized CPU on Android.

Instead of exposing thousands of models, Marmot ships **one champion per
weight class** — the highest-rated open model at each size a phone can run,
as of July 2026 — each with a RAM-fit badge computed from your device's
actual memory so you know before downloading whether it will run comfortably.

## Screens

| Home | Chat | Agent mode |
| :---: | :---: | :---: |
| <img src="docs/assets/screen-chats.svg" width="230" alt="Conversation list" /> | <img src="docs/assets/screen-chat.svg" width="230" alt="Streaming chat" /> | <img src="docs/assets/screen-agent.svg" width="230" alt="Agent mode with tool-call timeline" /> |

| Voice mode | Quick actions | Memory & RAG |
| :---: | :---: | :---: |
| <img src="docs/assets/screen-voice.svg" width="230" alt="Live voice conversation mode" /> | <img src="docs/assets/screen-ingest.svg" width="230" alt="Share text to Marmot: summarize, translate, proofread" /> | <img src="docs/assets/screen-memory.svg" width="230" alt="Agent memory: view, add, delete" /> |

| Every launch | Model library | Export |
| :---: | :---: | :---: |
| <img src="docs/assets/screen-welcome.svg" width="230" alt="Welcome screen: the marmot greets you with a random one-liner" /> | <img src="docs/assets/screen-models.svg" width="230" alt="Model library with downloads" /> | <img src="docs/assets/screen-export.svg" width="230" alt="Export a chat to Drive, OneDrive, or Files" /> |

| Settings |
| :---: |
| <img src="docs/assets/screen-settings.svg" width="230" alt="Settings with appearance, verification, and GPU toggles" /> |

### Real screenshots — captured from a live emulator run

The mockups above show the design; these are actual captures from the app
running on an Android 15 emulator (Pixel 7 profile) with **Qwen3.5 0.8B
generating on-device** — 8.6 tok/s on emulated x86 CPU (real ARM phones with
NEON are considerably faster).

| First launch | Model library | Real inference | Reasoning folded |
| :---: | :---: | :---: | :---: |
| <img src="docs/assets/real/welcome.png" width="190" alt="Real welcome screen capture" /> | <img src="docs/assets/real/models.png" width="190" alt="Real model library with downloaded model" /> | <img src="docs/assets/real/inference.png" width="190" alt="Real on-device generation with tok/s stats" /> | <img src="docs/assets/real/thinking.png" width="190" alt="Thinking indicator during reasoning" /> |

## Features

**Chat**

- 🐹 **A proper hello** — every launch, the marmot pops up with a random
  one-liner (“Zero servers were consulted in the making of this app.”)
  before getting out of your way. Tap to skip.
- ⚡ **Streaming replies** with tok/s stats, rendered as markdown (bold,
  lists, code blocks, tappable links) in assistant bubbles.
- 🤔 **Reasoning-model aware** — `<think>…</think>` blocks fold into a
  "Thinking…" indicator instead of leaking raw tags.
- 🎭 **Personas** — five built-ins (Concise, Coach, Writer, Tutor, Developer)
  plus save-your-own; the active persona shapes chat and agent answers alike.
- 🎛️ **Tunable sampling** — temperature, top-p, max tokens, context length,
  system prompt; 🌗 light by default, with dark and follow-system themes.

**Agent**

- 🤖 **Agent Mode** — flip the ⚙ chip and the model works step-by-step with
  local tools (calculator, clock, chat search, document search), showing a
  live thought/tool/observation timeline. Multi-step tasks are orchestrated:
  a planner decomposes, fresh-context executors run each step, live ☑
  check-offs, then a synthesizer produces the answer
  ([docs/AGENT.md](docs/AGENT.md)).
- ⚖️ **Verified answers (optional)** — a reflection pass may revise, an
  independent judge scores; the verdict badge persists on the message.
- 🧠 **Memory** — user/project facts (editable in Settings → Memory) plus
  auto-captured episode summaries, recalled *by meaning* with on-device
  embeddings and injected into agent runs.
- 📚 **Document & repo RAG** — import text/markdown files or a public GitHub
  repo (`owner/repo`) and chat with them via semantic search, fully
  on-device.
- 🌐 **Web research (opt-in)** — `web_search` + `fetch_page` tools with cited
  sources; with the switch off, Marmot is provably offline.
- 🔌 **MCP client** — connect Model Context Protocol servers over HTTP
  (home server, Home Assistant, work tools); their tools appear in Agent
  Mode, namespaced per server, gated by the same policy layer.

**Everyday**

- ⚡ **Share-to-Marmot** — share a screenshot, receipt, message, page, or
  document from any app (or paste) and get one-tap local actions. Calendar
  previews show the resolved date/time, require approval, and support undo;
  transforms, drafts, and saves remain visibly reviewable.
- 🔬 **Deep research** — with web access on, a Research toggle steers the
  agent into multi-angle searches, source fetches, and a cited report.
- 🔗 **Automation hooks** — `marmot://ask?text=…` deep link for iOS
  Shortcuts and Android automation.

**Voice**

- 🎙️ **Conversation mode** — a hands-free listen → think → speak loop with
  an animated, phase-aware voice stage.
- 📝 **Meeting mode** — continuous transcription with a recording timer;
  say "Marmot, …" for a suggested contribution (tap-to-speak card — it never
  talks into the room uninvited); transcripts save into searchable documents.

**Models & data**

- **Vision attachments** — the SmolVLM 256M starter model downloads with its
  paired projector, so screenshots and receipts can be understood locally;
  PDFs and audio remain explicitly unsupported until their dedicated paths are
  shipped.

- 📦 **Resumable downloads** that continue in the background and survive
  restarts; a `.gguf` on disk is always complete (atomic `.part` moves).
- 📱 **RAM-fit badges** ("Runs great / Should run / May be too big") from
  your device's actual memory; import any local `.gguf` as a first-class
  model; experimental Android GPU toggle.
- 📤 **Export, import & share** — Markdown chat sharing and JSON backups via
  the OS share sheet (Drive, OneDrive, Files — no cloud SDKs, no OAuth);
  restores merge without ever overwriting newer local history.
- 🔒 **Private by architecture** — no account, no backend, no telemetry;
  ~2 MB JS bundle; one model in memory at a time. Capability designs for
  what's next live in [docs/CAPABILITIES.md](docs/CAPABILITIES.md).

## Model catalog

| Class | Model | Download | Runs on | Why it's the pick |
| --- | --- | --- | --- | --- |
| Vision starter | SmolVLM 256M Vision | 365 MB | ~1.5 GB+ RAM | Local screenshot and receipt understanding with a paired projector |
| 🪶 Featherweight | Qwen3.5 0.8B | 0.53 GB | any phone | Rated far above every other sub-1B; 200+ languages |
| 🥊 Lightweight | Qwen3.5 2B | 1.28 GB | 4–6 GB RAM | Beats Gemma 4 E2B on reasoning, GPQA, intelligence |
| 🥋 Middleweight | SmolLM3 3B | 1.92 GB | 6 GB RAM | Strongest fully-open 3B, dual-mode reasoning |
| 🏋️ Cruiserweight | Qwen3.5 4B | 2.74 GB | 8 GB RAM | Strongest dense 4B: knowledge, science, agentic wins |
| 👑 Heavyweight | Gemma 4 E4B | 4.06 GB | 12 GB+ RAM | 8B weights at a 4B footprint; closest to cloud quality |

All catalog entries use Apache 2.0 licenses. Text models are Q4_K_M GGUF builds
(Gemma 4 E4B ships as Q3_K_M to stay phone-sized) from
[unsloth](https://huggingface.co/unsloth); the SmolVLM vision starter uses the
ggml-org build. URLs and
exact byte sizes verified against the hosted files. Rankings from
[Artificial Analysis](https://artificialanalysis.ai) and per-tier benchmark
comparisons; re-evaluated as new models ship. Beyond the catalog, any local
`.gguf` can be imported from the Files app ("Import .gguf" in the model
library) and used as a first-class model.

## Getting started

**Just want the app?** [Download the latest Android APK](https://github.com/stancsz/marmot/releases/latest/download/marmot.apk)
and sideload it. Browse [release history](https://github.com/stancsz/marmot/releases)
for checksums and notes. The current public artifact is the sideload baseline;
Google Play and TestFlight/App Store builds are prepared in
[the store runbook](docs/STORE_RELEASE.md) but are not claimed shipped until
credentialed internal installs are verified.

Building from source: Marmot uses native modules, so it needs a development
build (not Expo Go).

**Prerequisites:** Node 20+, and Android Studio (Android) or Xcode on macOS (iOS).

```bash
git clone https://github.com/stancsz/marmot.git
cd marmot
npm install

npx expo run:android   # Android
npx expo run:ios       # iOS (macOS only)
```

`expo run` generates the native `android/` and `ios/` projects automatically
(continuous native generation) — they are disposable and not checked in.

> **Windows note:** if llama.rn's postinstall fails with a tar error under Git
> Bash, rerun it with Windows' native tar:
> `PATH="/c/Windows/System32:$PATH" node node_modules/llama.rn/install/download-native-artifacts.js`

## Architecture

```
src/
  models/catalog.ts       # curated model list (id, URL, exact size, license)
  agent/                  # pure-TS agent core — fully unit-tested
    loop.ts               #   Observe→Decide→Act→Verify + JSON tool protocol
    orchestrator.ts       #   per-step subagent executors + judge gate
    planner.ts  skills.ts #   task decomposition; trigger→procedure registry
    memory.ts  documents.ts  semantic.ts   # memory + RAG, cosine retrieval
    tools.ts  web.ts      #   calculator/clock/search + opt-in web tools
    reflection.ts  verify.ts               # self-critique + judge scoring
  lib/
    engine.ts             # llama.cpp context lifecycle, embeddings, GPU opts
    agentRuntime.ts       # wires the agent core to the engine + stores
    downloads.ts          # resumable background downloads, atomic moves
    chatStore.ts  importParse.ts  exportShare.ts   # persistence + backup
    customModels.ts  repoCore.ts  repoImport.ts    # .gguf + GitHub imports
    voiceSession.ts       # voice-mode state machine (tested)
    markdown.ts  personas… thinking…  deviceMemory…
  screens/                # ChatList, Chat, Models, Memory, Voice, Settings
```

**Stack:** React Native (Expo SDK 57) · [llama.rn](https://github.com/mybigday/llama.rn) · TypeScript.

## Adding a model to the catalog

One entry in [`src/models/catalog.ts`](src/models/catalog.ts):

```ts
{
  id: 'my-model-1b',
  name: 'My Model 1B',
  family: 'Vendor',
  params: '1B',
  quant: 'Q4_K_M',
  sizeBytes: 807_694_464,        // exact — verify with: curl -sIL <url> | grep -i content-length
  url: 'https://huggingface.co/…/resolve/main/….gguf',
  description: 'One or two sentences on what it is good at.',
  license: 'Apache 2.0',
  thinking: false,               // true if it emits <think> blocks
}
```

Catalog PRs are welcome, with two constraints: the model must run acceptably
on a phone (≤ ~4 GB quantized), and the size must be the exact byte count of
the hosted file — the download manager and RAM-fit badges depend on it.

## What's next

Image and screenshot attachments are now locally grounded through the SmolVLM
starter path, and Flight mode now provides five bounded offline activities.
The next product work is turning extracted facts into typed action previews,
then adding explicit companion milestone saves; PDF/audio decoding remains a
separate milestone.

The next product release is **E4B-first**: make a capable phone immediately
feel like a private, multimodal assistant. The flagship loop is:

**share something → understand it locally → propose the next action → approve
and execute it on the phone.**

Near-term priorities:

- [x] Chat UI/UX foundation: professional icons, accessible touch targets, fluid state motion, clean Markdown history previews, model dropdown, and calm left history drawer
- [x] E4B device-fit detection, model recommendation, and offline first-run demo
- [x] Native Share-to-Marmot with action cards for summarize, extract, reply, save, and explain
- [x] Local text/Markdown attachments with bounded grounding and an explicit untrusted-data boundary
- [x] Screenshot/image grounding for E4B-capable devices; [ ] PDF/audio decoding
- [x] Bounded Flight mode with local-only activities and no background work
- [x] Calendar event preview, explicit approval, local-calendar fallback, and undo
- [ ] Reminders, contacts, and approval-gated compose actions
- [ ] Personal context with projects, grounded sources, and local retrieval
- [ ] Voice notes → transcript → decisions/action items → reminders
- [ ] Validate the core loop on real E4B hardware, then add one email provider

Web research, MCP, repo coding, file organization, live meeting participation,
and deep research remain available as advanced Labs. The full product roadmap
and quality bar live in [docs/CAPABILITIES.md](docs/CAPABILITIES.md).

## Contributing

The [five-minute contributor guide](CONTRIBUTING.md) covers the Windows and
macOS build path, focused lanes, issue templates, and privacy-safe evidence.
Use [the benchmark matrix](docs/BENCHMARKS.md) for reproducible device
reports and [the model-catalog workflow](docs/MODEL_CATALOG_CONTRIBUTIONS.md)
for new local models. Discussions are for design questions; issues are for
reproducible bugs and scoped tasks. Track installs separately from GitHub
activity in the [distribution ledger](docs/DISTRIBUTION.md).

## Acknowledgements

- [llama.cpp](https://github.com/ggml-org/llama.cpp) — the inference engine
- [llama.rn](https://github.com/mybigday/llama.rn) — llama.cpp bindings for React Native
- [unsloth](https://huggingface.co/unsloth) and
  [bartowski](https://huggingface.co/bartowski) — the quantized GGUF builds
- Meta, Google, Alibaba, and Hugging Face for the open models

## License

[MIT](LICENSE) — the app. Each model has its own license (shown in the
catalog and in-app) that you accept by downloading it.
