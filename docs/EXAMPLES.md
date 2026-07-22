# Marmot examples

These are real, sanitized Android verification examples for the flagship loop:

share something -> understand it locally -> propose an action -> approve ->
execute on the phone.

The statuses are deliberately precise. A safe rejection or a pending quality
gate is not presented as a successful AI result.

## Message -> calendar event

**Status: verified pass.** An external Android text share containing
`Team sync tomorrow at 10 AM` arrived in Quick actions. Marmot showed an
editable calendar preview, waited for approval, added the event to the local
calendar, and removed it with Undo. The approved result also opened the native
share sheet with optional private-processing attribution, the install link,
and the canonical GitHub link.

- [before/after runtime log](verification/flagship-share-vertical-2026-07-22.md)
- [calendar preview](verification/flagship-calendar-preview-card-2026-07-22.png)
- [approved event](verification/flagship-calendar-approved-share-card-2026-07-22.png)
- [Undo result](verification/flagship-calendar-undone-2026-07-22.png)

## Event screenshot -> local intake

**Status: intake verified; OCR quality open.** A real Android Photos share
delivered a sanitized event-card image to Marmot. The image was copied into
private app storage and the local vision model initialized. The OCR guard did
not recognize a clear title/date/time, so Marmot refused to create a calendar
action instead of guessing. Image attachments now also offer a generic
`Extract text from image` fallback that creates an approval-gated Save to
documents preview; receipt-quality OCR is still unverified.

- [external screenshot intake](verification/flagship-external-screenshot-clean-2026-07-22.png)
- [safe extraction guard](verification/flagship-screenshot-extraction-strict-final-2026-07-22.png)
- [generic image-text action chip](verification/image-text-chip-2026-07-22.png)
- [generic image-text safe failure](verification/image-text-fail-guarded-final-2026-07-22.png)
- [runtime record](verification/image-text-2026-07-22.md)

## Private message -> draft reply

**Status: safety and approval boundary verified; clean model quality open.**
This sanitized message was shared from outside Marmot:

> Could we move our 10 AM team sync to 2 PM tomorrow? I have a conflict.

The small local model emitted an unusable repetitive answer. Marmot rejected it,
showed a grounded editable fallback mentioning `2 PM tomorrow`, and displayed
an explicit warning. Approval changed only the local action card to
`Approved locally`; no message was sent. This is a reliability example, not a
claim that the 0.8B model is ready for polished reply generation.

- [message before action](verification/private-message-before-draft-fixed-2026-07-22.png)
- [guarded preview](verification/private-message-draft-guarded-2026-07-22.png)
- [approved locally](verification/private-message-draft-approved-2026-07-22.png)

## Receipt -> extraction

**Status: generic local text preview implemented; receipt quality open.** The
generic image-text path preserves readable lines and refuses empty/`NONE`
results. Receipt OCR and receipt-to-action behavior are not claimed until a
real sanitized receipt fixture passes local extraction, approval, and
phone-action checks. The current screenshot benchmark documents the vision
latency and safe failure boundary instead.

The latest Android run also rejected a model-generated page description rather
than showing it as extracted text or saving it. That proves the safety boundary,
not receipt-quality OCR.

## Offline travel

**Status: verified pass.** Flight mode presents bounded local activities and a
no-network/no-background contract. A travel result rendered locally, and Stop
returned `Stopped. Nothing was saved.`

- [Flight mode proof](verification/android-flight-mode.png)
- [local travel result](verification/android-flight-mode-result.png)
- [Stop path](verification/android-flight-stop.png)

## What to reproduce next

Run the same examples on one low-, mid-, and high-tier Android phone and one
low-, mid-, and high-tier iPhone. Record first useful result, cancellation,
RAM, battery, storage, and download behavior in [the benchmark matrix](BENCHMARKS.md).
