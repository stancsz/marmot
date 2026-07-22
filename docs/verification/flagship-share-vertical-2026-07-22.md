# Flagship share-to-action readiness - 2026-07-22

## Source path now implemented

- `expo-share-intent` accepts Android `text/*` and `image/*` and iOS text,
  web URL, and image shares.
- `App.tsx` finds the incoming image, copies it into Marmot's private
  attachment directory, and routes text plus the local attachment to Quick
  actions.
- Quick actions displays the shared image, gates extraction on a downloaded
  vision-capable local model, asks the model for one explicit event line, and
  turns that line into the existing typed calendar card.
- The user must still press `Add to calendar`; the existing permission,
  calendar write, and `Undo event` path remains the only phone side effect.
- Extraction refuses to create a calendar preview when the local answer lacks
  labeled title/date/time fields and a clear explicit date/time instead of
  guessing from unrelated screen metadata.

## Local evidence

| Check | Result |
| --- | --- |
| Shared-media normalization tests | 3 passed |
| Phone-action tests | 9 passed, including strict OCR field and explicit-time guards |
| TypeScript | `npx tsc --noEmit` passed |
| Android prebuild | passed; generated manifest contains `SEND` with `text/*` and `image/*` |
| Focused source verifier | PASS; the verifier executes the focused behavior test and source checks |

## Runtime evidence

The canonical local target was available for this run and the native
development build installed successfully:

| Field | Observed value |
| --- | --- |
| AVD | `marmot`, Pixel 7 profile |
| Android | 35, Google APIs, `x86_64` |
| Memory | 1536 MB configured RAM |
| App | `app.marmot.chat`, version `0.2.0`, versionCode `2` |
| Build | `npx expo run:android`; APK installed and launched through Metro |

### External text share: pass

An Android `SEND` intent from outside Marmot delivered `Team sync tomorrow at
10 AM` into Quick actions. Marmot rendered the `Add to calendar` action, showed
an editable preview with the resolved `tomorrow · 10:00 AM–11:00 AM` time, and
did not write before approval. Tapping `Add to calendar` produced `Added to
calendar`; tapping `Undo event` removed it and produced `Removed from
calendar`.

Evidence:

- [external text intake](flagship-external-text-full-2026-07-22.png)
- [calendar preview](flagship-calendar-preview-card-2026-07-22.png)
- [approved calendar event](flagship-calendar-approved-2026-07-22.png)
- [undo result](flagship-calendar-undone-2026-07-22.png)

After approval, the result also crossed the share boundary: Marmot opened the
native Android text share sheet with the resolved event title/date/time,
optional `Processed privately by Marmot` attribution, and the public install
and GitHub links. The event was then undone so the emulator calendar was left
clean.

Evidence:

- [approved result card](flagship-calendar-approved-share-card-2026-07-22.png)
- [native share sheet with result preview](flagship-approved-share-sheet-2026-07-22.png)
- [post-share undo result](flagship-calendar-undone-2026-07-22.png)

### External screenshot intake: pass; extraction quality: open

A real Android Photos share (not a synthetic `file://` intent) delivered an
event-card screenshot to Marmot. The image was copied into Marmot's private
attachment directory, the chip showed `Ready for vision`, and the local
SmolVLM 256M model plus paired projector initialized and tokenized the image
successfully. On the clean rerun, the stricter OCR prompt still produced an
unparseable answer; the guard showed `Could not read screenshot` and did not
create an action card. This run therefore does **not** claim screenshot-to-
calendar completion.

Evidence:

- [clean Photos share intake](flagship-external-screenshot-clean-2026-07-22.png)
- [tight event-card fixture](flagship-event-card-crop-2026-07-22.png)
- [crop share intake](flagship-crop-share-clean-2026-07-22.png)
- [clean extraction guard result](flagship-screenshot-extraction-strict-final-2026-07-22.png)

The vision evaluation took approximately 40–42 seconds on this 1536 MB
`x86_64` emulator and logged skipped frames while processing the image. This
is useful evidence for the benchmark matrix and a real-phone performance gate,
not a product latency promise. The next gate is a better OCR-capable local
vision path or a larger phone-fit vision model, followed by repeating the real
Photos share → preview → approval → undo run. The current implementation
keeps the safe manual-edit path instead of guessing.

### Private message to draft reply: guarded pass; model quality open

A sanitized external message share reached Quick actions with the original
message intact:

> Could we move our 10 AM team sync to 2 PM tomorrow? I have a conflict.

The local 0.8B model produced a long repetitive answer on the first rerun and
was rejected by the draft validator. Marmot then showed a grounded, editable
local fallback — `Thanks for letting me know. I will check whether 2 PM
tomorrow works for the team and get back to you.` — with an explicit warning
to review it before approval. Approval changed the card to `Approved locally`;
it did not send a message. This proves the safety boundary and fallback
behavior, not high-quality generative drafting yet.

Evidence:

- [sanitized message before action](private-message-before-draft-fixed-2026-07-22.png)
- [guarded draft preview](private-message-draft-guarded-2026-07-22.png)
- [approved locally, still not sent](private-message-draft-approved-2026-07-22.png)

The next draft-quality gate is a small-device pass rate across several
messages, with no generic helper templates, repetition, or unsupported facts.
