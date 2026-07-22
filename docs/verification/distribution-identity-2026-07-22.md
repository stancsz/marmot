# Public distribution verification — 2026-07-22

## Canonical identity

- Canonical application repository: `https://github.com/stancsz/marmot`
- Public homepage: `https://super-marmot.github.io/`
- GitHub metadata was verified after update: the homepage points to the live
  site, the description names the share-to-action loop, Discussions are
  enabled, and the latest release remains `v0.1.0`.
- The separate Pages repository is synchronized and published at commit
  `99bfdb1`; its GitHub Pages deployment run `29934299051` completed
  successfully after Marmot commit `4711dcf` was pushed.

## Live checks

- A no-cache homepage request returned HTTP 200 with title
  `Marmot — from shared screenshot to phone action`, the flagship promise,
  the proof section, exact `192` test count, raw proof asset links, and the
  stable APK link.
- Raw proof assets returned HTTP 200, including the clean external screenshot
  intake, approved result card, and native share-sheet capture.
- `https://github.com/stancsz/marmot/releases/latest/download/marmot.apk`
  returned HTTP 200 with `application/vnd.android.package-archive` and a
  `175874623`-byte artifact.
- Visual proof: [homepage-share-to-action-2026-07-22.png](homepage-share-to-action-2026-07-22.png)
  shows the share-to-action hero, local-only copy, Quick actions screen, and
  Android download CTA.

## Repository gates

- 32 Jest suites / 192 tests passed.
- TypeScript passed with `npx tsc --noEmit`.
- Android export passed with `npx expo export --platform android`.
- All 10 product verifiers and their adequacy audits passed.
- `python scripts/ship_gate.py` passed.

## Known limitations

The current GitHub release is development-signed for sideloading. Production
Android signing, Google Play, TestFlight/App Store distribution, and the
external-app screenshot/message → typed action E2E flow remain open milestones.
