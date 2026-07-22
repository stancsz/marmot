| id | dimension | claim, one sentence | single run command | iter-N |
| --- | --- | --- | --- | --- |
| chat-uiux-verifier | ui-ux | Chat and attachment controls meet the icon, touch-target, accessibility, and motion contract | `node .mochu/verifiers/chat-uiux/verify.mjs` | iter-1 |
| chat-history-polish-verifier | ui-ux | The history drawer hides internal reasoning language and uses a lighter, clearer mobile hierarchy | `node .mochu/verifiers/chat-history-polish/verify.mjs` | iter-3 |
| e4b-demo-verifier | onboarding-first-run | The recommended model leads to an explicit real-content local-only demo in chat | `node .mochu/verifiers/e4b-demo/verify.mjs` | iter-4 |
| share-actions-verifier | features | Shared text produces typed preview cards and local writes require explicit approval | `node .mochu/verifiers/share-actions/verify.mjs` | iter-5 |
| phone-actions-verifier | features | Shared text can become an approval-gated calendar event with Undo | `node .mochu/verifiers/phone-actions/verify.mjs` | iter-6 |
| attachment-grounding-verifier | features | Plain-text attachments are bounded, locally grounded, and honest about unsupported media | `node .mochu/verifiers/attachment-grounding/verify.mjs` | iter-7 |
| multimodal-grounding-verifier | features | A compatible local vision model and projector ground image attachments without a cloud fallback | `node .mochu/verifiers/multimodal-grounding/verify.mjs` | iter-8 |
| pii-action-verifier | features | The Quick actions screen provides deterministic local PII redaction with a semantic privacy icon | `node .mochu/verifiers/pii-action/verify.mjs` | iter-9 |
| flight-mode-verifier | product | Flight mode exposes bounded offline activities with a local-only proof and an explicit stop path | `node .mochu/verifiers/flight-mode/verify.mjs` | iter-10 |
| distribution-identity-verifier | seo-positioning-copy | Public repo and homepage use one canonical repository, stable release link, and the share-to-action promise | `node .mochu/verifiers/distribution-identity/verify.mjs` | iter-11 |
| store-distribution-verifier | trust | Production Android signing, AAB release, and EAS Android/iOS submission are configured without hard-coded credentials | `node .mochu/verifiers/store-distribution/verify.mjs` | iter-12 |
| flagship-share-vertical-verifier | features | External screenshot/message share is copied locally, understood by a vision-capable model, and becomes an approval-gated calendar action | `node .mochu/verifiers/flagship-share-vertical/verify.mjs` | iter-13 |
