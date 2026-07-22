# Quick-action Stop verification - 2026-07-22

Target: `marmot` AVD, Pixel 7 profile, Android 35, `x86_64`, 1536 MB RAM,
`emulator-5554`, Metro development build, commit `41ece9b`.

## Result

**Control visible; cancellation outcome not verified.** After starting the
image-backed quick action, Android UI automation observed the new accessible
`Stop` control within 125 ms at bounds `[923,2306][1038,2400]`. The attempted
run was then confounded by the image fixture path returning a `Could not read
screenshot` alert while the stop poll timed out. No phone write or approved
action card was observed, but this run does not prove `Stopped. Nothing was
saved.`, stop-to-idle timing, or recovery on a subsequent prompt.

The code path is covered by local Jest (32 suites / 204 tests), TypeScript,
Android export, and GitHub CI. A clean text-generation run still needs to
capture Stop during visible streaming, verify no late tokens or action card,
measure cancel-to-idle, and send a second prompt on the same device.
