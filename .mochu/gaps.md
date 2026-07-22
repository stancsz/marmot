# Gap register

| id | dimension | gap | evidence: what was observed | impact | effort | confidence | I*C/E |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| chat-uiux | ui-ux | Closed: Chat controls now use semantic platform icons, accessible 44pt targets, deliberate motion, clean Markdown previews, a model dropdown, and grouped history drawer | Android emulator verification shows the drawer, dropdown, professional composer icons, and readable history previews; automated UI verifier passes | 5 | 3 | 5 | 8.3 |
| chat-history-polish | ui-ux | Closed: History drawer no longer exposes internal answer-status language and now uses a calmer outlined action, readable previews, and restrained scrim/footer treatment | Android emulator screenshot shows clean short-history rows, a lighter drawer, and Settings contained within the drawer; focused verifier and corpus pass | 4 | 1 | 5 | 20.0 |
| e4b-path | onboarding-first-run | Closed: model library recommends the largest non-risky catalog tier from actual device RAM and leads into a real local-only first-run demo | Android emulator shows the recommendation, Try offline demo action, local-only proof, and a real Paris answer; focused verifier and corpus pass | 5 | 4 | 5 | 6.3 |
| e4b-demo | onboarding-first-run | Closed: the ready model card opens a dedicated proof card and invokes the normal engine with short no-reasoning output | Android emulator verified the explicit tap, model loading, local-only copy, and stored Paris response; 2 focused tests pass | 5 | 2 | 5 | 12.5 |
| share-actions | features | Closed: Share intake produces typed preview cards for transforms, unsent drafts, and local document saves with explicit approval | Android emulator shows a structured Draft reply card marked Preview only / Not sent, plus Save preview and second-tap approval; focused verifier and corpus pass | 5 | 3 | 5 | 8.3 |
| pii-action | features | Closed: Quick actions now provide a deterministic on-device PII eraser for common email, phone, URL, card, and SSN-like values with a copyable preview | Android Quick actions showed the shield chip and a PII removed card without loading a model; focused verifier and runtime screenshot pass | 4 | 1 | 5 | 20.0 |
| phone-actions | features | Calendar milestone closed: shared text now becomes a deterministic, approval-gated local calendar event with undo; reminders, contacts, and compose remain | Android emulator verified explicit time grounding, permission approval, local-calendar fallback, event creation, and undo; remaining phone actions still have no native adapters | 5 | 5 | 4 | 4.0 |
| attachment-grounding | features | Closed: plain-text and Markdown attachments are copied into app storage, read locally, bounded to 8,000 characters, and marked as untrusted reference data | Android picker selected `marmot-attachment-sample.txt`; Qwen3.5 returned `snowdrop` without following the fixture's instruction-like line; focused tests and 27-suite regression pass | 5 | 2 | 5 | 12.5 |
| multimodal | features | Image slice closed: the catalog now packages SmolVLM 256M with its paired projector and grounds local image attachments; PDFs and audio remain open | Android downloaded both assets, the composer showed Ready for vision, and llama.rn returned a grounded answer from a screenshot with no cloud fallback; focused tests and verifier pass | 5 | 4 | 5 | 6.3 |
| offline-companion | product | Flight mode MVP closed: a user-invoked offline surface now offers five bounded local activities with no background work; explicit companion milestones and opt-in notifications remain open | Android shows the drawer entry, Offline companion proof, five activities, local model status, and a real generated result; no persistent pet-memory or notification contract is implemented yet | 5 | 2 | 5 | 12.5 |
| distribution-identity | seo-positioning-copy | Closed: `stancsz/marmot` is the canonical public repo, the homepage leads with share-to-action, and every public download CTA resolves to the stable latest APK URL | GitHub metadata points to `https://super-marmot.github.io/`; README, Marmot homepage source, Pages mirror, and release workflow use `stancsz/marmot` and `releases/latest/download/marmot.apk`; distribution verifier and live metadata checks pass | 5 | 2 | 5 | 12.5 |
| provider-connector | features | One read-only email provider connector is not implemented | P5 requires OAuth and provider permission setup unavailable to local tests | 3 | 5 | 3 | 1.8 |
| store-distribution | trust | Production-signed Android and iOS store builds are not shipped | Production EAS profiles, a fail-closed Android signing workflow, and a store runbook now exist; the only live artifact remains a development-signed sideload APK because no EAS/Play/Apple credentials are configured | 5 | 5 | 5 | 5.0 |
| flagship-share-vertical | features | Android shared screenshot/message intake does not yet complete typed extraction into an approval-gated phone action | Source now accepts external image shares, copies them locally, gates extraction on SmolVLM vision, and creates the existing calendar preview; external-app runtime verification is still open because this workstation has no adb/SDK/Java | 5 | 4 | 5 | 6.3 |
| device-benchmarks | performance | No reproducible low/mid/high Android and iPhone matrix covers useful-result latency, speed, RAM, battery, storage, downloads, cancellation, and model fit | Existing runtime evidence is concentrated on the 1.5 GB Android emulator and small models; no real iPhone or tiered device report exists | 5 | 4 | 5 | 6.3 |
| referral-cards | features | Approved results are not yet rendered as beautiful forwardable cards with optional private-processing attribution and install links | Current action cards are in-app previews; no share/export card format or public before/after examples are shipped | 4 | 3 | 5 | 6.7 |
| contributor-engine | developer-experience | Contributor onboarding, issue templates, Discussions workflow, and reproducible benchmark contribution path are incomplete | README has a basic source-build path but no five-minute contributor guide, templates, or model-catalog workflow | 4 | 3 | 5 | 6.7 |

## Priority decision

Ship the interaction foundation first because it is the highest-confidence,
highest-impact surface improvement and becomes the interaction foundation for
the local assistant loop. Then prove the value proposition with E4B fit and a
real offline answer, followed by share-to-action cards and approval-gated phone
outcomes. The image slice of multimodal share intake is now closed: screenshots
and receipts are highly shareable, frequently useful, and make the local-model
advantage visible without an account or provider OAuth. The next highest-ROI
implementation is to turn extracted screenshot/receipt facts into typed action
previews. Flight mode now supplies the bounded offline retention surface; the
companion follow-up should add explicit, user-controlled milestone saves rather
than hidden background activity. PDF/audio decoding remains a separate
capability milestone.
Canonical identity and public entry points are now aligned. The next explicit
release gate is production signing and store distribution; while store
credentials are prepared, the flagship vertical should close the remaining
external-app screenshot/message → typed action gap. Provider OAuth remains
later because it has higher setup cost, privacy risk, and lower viral reach
than a local share-to-outcome loop.
