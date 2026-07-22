# Generic image-text verification — 2026-07-22

Target: `marmot` AVD, Pixel 7 profile, Android 35, `x86_64`, 1536 MB RAM,
`emulator-5554`, Metro development build.

Fixture: the sanitized `flagship-external-screenshot-2026-07-22.png` shared
through Android Photos. The attachment arrived in Marmot as private
`marmot-test.png` with `Ready for vision`.

## Result

**Safe-failure pass; OCR quality remains open.** The new Phone actions list
showed both `Extract text from image` and the existing `Extract calendar event`
actions. The local SmolVLM run returned the model description
`Page showing information about the app.` rather than faithful OCR. The
normalizer rejected that description, showed `Could not extract text` with
`I could not confirm readable text in this image. No document was created.`,
and left no result text or Save to documents card after dismissal.

- [image action chips](image-text-chip-2026-07-22.png)
- [guarded failure alert](image-text-fail-guarded-final-2026-07-22.png)

This is intentionally not a receipt extraction success claim. A real
sanitized receipt fixture still needs to pass line fidelity, approval, and
phone-save checks before receipt quality is marked verified.
