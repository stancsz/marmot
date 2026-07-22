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
  a clear today/tomorrow time instead of guessing a date.

## Local evidence

| Check | Result |
| --- | --- |
| Shared-media normalization tests | 3 passed |
| Phone-action tests | 4 passed, including explicit-time extraction guard |
| TypeScript | `npx tsc --noEmit` passed |
| Android prebuild | passed; generated manifest contains `SEND` with `text/*` and `image/*` |
| Focused source verifier | PASS; the verifier executes the focused behavior test and source checks |

## Runtime boundary

The external share-to-action flow is **not claimed** as runtime-verified in this
environment. This workstation currently has no `adb` on `PATH` or discoverable
Android SDK, and no `JAVA_HOME`/Java runtime for a fresh native build. The
canonical `marmot` AVD configuration is present (Pixel 7, Android 35,
`x86_64`, 1536 MB), but it could not be started or driven from this checkout.

The remaining runtime gate is a fresh development or signed build on that AVD:
share an event screenshot from an external Android app, observe Marmot's local
attachment chip, tap `Extract calendar event`, verify the event preview's
resolved time, approve `Add to calendar`, then verify `Undo event`. Record the
screen states and result in this file before closing the flagship gap.
