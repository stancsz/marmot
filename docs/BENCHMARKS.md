# Marmot reproducible device benchmarks

Status: protocol and evidence snapshot dated 2026-07-22.

This page is the public entrypoint for Marmot performance results. It defines
what to measure for the local `share -> understand -> approved phone action`
loop and how another contributor can reproduce it. A number is publishable
only when it is tied to an app commit, a model file hash, a device record, a
fixed workload, and raw evidence.

The matrix is intentionally honest: the canonical Android emulator has a
small amount of measured smoke evidence, but no real-device or iPhone result
is filled in by inference. The emulator is not a phone proxy.

## Reporting rules

- **Measured** means the run completed with the procedure below, the required
  repetitions were recorded, and raw evidence is attached or linked.
- **Observed boundary** means a useful runtime observation that does not yet
  satisfy the matrix protocol. It must not be presented as a benchmark result.
- **Pending** means no result is available. Use `null` in result data; never use
  a guessed number, a device-spec number, or a rounded estimate.
- **Blocked** means the run was stopped by a documented stop condition. Keep the
  failure and the stop reason; do not silently omit the model.
- Compare results only when app commit, build type, model hash, quantization,
  context length, output limit, workload fixture, and measurement method match.

Do not collect private messages, calendar data, account identifiers, or
credentials. The share-to-action check ends at the editable preview; it must
not approve a real phone write during benchmarking.

## Current evidence versus pending measurements

The following is the evidence available before this matrix was populated. It
is deliberately separate from the low/mid/high result rows below.

| Scenario | Status | Evidence | What remains pending |
| --- | --- | --- | --- |
| Text generation on the canonical Android emulator | **Measured smoke evidence** | The Pixel 7 Android 35 x86_64 AVD ran Qwen3.5 0.8B Q4_K_M locally and returned `Paris.` at about 8.6 tok/s for a 607-token run. See the [Android verification log](verification/android-2026-07-21.md). | First-visible-token timing, five-run median/p95, peak app memory, battery delta, and a timed cancellation result were not captured in that run. |
| Model download and local completion | **Measured smoke evidence** | Qwen3.5 0.8B is 532,517,120 bytes in the catalog and completed an on-device download with atomic finalization. The paired SmolVLM model is 175,054,528 bytes plus a 190,031,616-byte projector. | Transfer wall time, free-storage delta, SHA-256 evidence, and a controlled resume/cancel download run. |
| Image understanding on the canonical emulator | **Observed boundary; matrix pending** | The paired vision path returned `Page showing options.` and the verification log shows 58.5 tok/s for the result text. A separate runtime observation was approximately 40–42 seconds for image evaluation and showed skipped frames. | The image fixture hash, exact tap-to-result timing method, first visible token, peak memory, battery impact, and cancellation behavior. The 40–42 second observation is not a promise or a cross-device comparison. |
| RAM-fit and stop behavior | **Measured/observed boundary** | The emulator’s 0.8B path worked; 2B+ was marked risky on the 3 GB-class runtime. Deliberately forcing oversized 4B-class models produced swap thrashing and no timely first token, which is why the app asks for confirmation. See the [agent verification history](AGENT.md). | Per-model, per-device fit labels from this protocol. Never transfer the emulator outcome to a real Android phone or an iPhone. |

A machine-validated [emulator boundary record](benchmarks/results/2026-07-22-android-emulator-baseline-qwen3.5-0.8b-text-short.json)
captures the later cold `ui_poll` observation and the verified model hash. It is
explicitly `blocked`, not a populated phone-matrix cell: warm repetitions,
steady generation, battery, download, cancellation, and physical-device rows
remain pending.

## Benchmark matrix

### Cohorts

Use physical memory, not the marketing label, to assign a cohort. Record the
measured value in MiB even when a device is marketed as 6 GB or 8 GB. These are
reporting cohorts, not fit claims.

| Row ID | Platform and cohort | Cohort definition |
| --- | --- | --- |
| `android-low` | Android low | Real Android device with less than 6,000 MiB physical RAM. |
| `android-mid` | Android mid | Real Android device with 6,000–11,999 MiB physical RAM. |
| `android-high` | Android high | Real Android device with at least 12,000 MiB physical RAM. |
| `iphone-low` | iPhone low | Real iPhone with less than 5,000 MiB physical RAM. |
| `iphone-mid` | iPhone mid | Real iPhone with 5,000–7,999 MiB physical RAM. |
| `iphone-high` | iPhone high | Real iPhone with at least 8,000 MiB physical RAM. |
| `android-emulator-baseline` | Android emulator baseline | Pixel 7 profile, Android 35, x86_64, WHPX, AVD configured with 1,536 MB RAM. This is a separate emulator row, not a real-device cohort. |

If a device falls on an unusual boundary, keep the measured RAM and use the
nearest row only with a `tier_override` note. Do not hide the boundary.

### Result matrix

Every cell marked **Pending** must remain pending until a contributor submits a
valid record. In particular, this table contains no invented real-Android or
iPhone numbers.

| Row ID | First-token latency | Generation speed | Peak RAM | Battery impact | Storage / model download | Cancellation | Model-fit recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `android-low` | Pending | Pending | Pending | Pending | Pending | Pending | Start with the smallest pinned text and vision models; publish a fit label only after the stop-safe protocol passes. |
| `android-mid` | Pending | Pending | Pending | Pending | Pending | Pending | Measure 0.8B, 2B, and then 3B-class models; do not assume the catalog description is a device result. |
| `android-high` | Pending | Pending | Pending | Pending | Pending | Pending | Measure 2B–4B-class models and vision; test the largest model only when the stop conditions can be observed safely. |
| `iphone-low` | Pending — no estimate | Pending — no estimate | Pending — no estimate | Pending — no estimate | Pending — no estimate | Pending — no estimate | No static iPhone recommendation is published before a real-iPhone run. |
| `iphone-mid` | Pending — no estimate | Pending — no estimate | Pending — no estimate | Pending — no estimate | Pending — no estimate | Pending — no estimate | No static iPhone recommendation is published before a real-iPhone run. |
| `iphone-high` | Pending — no estimate | Pending — no estimate | Pending — no estimate | Pending — no estimate | Pending — no estimate | Pending — no estimate | No static iPhone recommendation is published before a real-iPhone run. |
| `android-emulator-baseline` | Pending for timing | **Measured smoke:** 8.6 tok/s, 607 tokens on Qwen3.5 0.8B | Pending for this protocol | Pending | **Measured bytes:** 532,517,120 for Qwen3.5 0.8B; 365,086,144 combined for SmolVLM + projector. Transfer time pending. | Stop path exercised; timed stop-to-idle and next-send checks pending | 0.8B worked; larger-model behavior is emulator-only evidence, not a phone recommendation. |

The matrix measures at least these pinned workloads:

| Workload ID | Purpose | Required input |
| --- | --- | --- |
| `text-short` | First visible token and correctness | `Answer with one word only: What is the capital of France?` Expected semantic answer: Paris. |
| `text-steady` | Stable generation speed | `Write 80 to 100 plain-text tokens explaining why on-device processing can protect privacy. Do not use bullets, markdown, or tool calls.` |
| `vision-extract` | Local image understanding | One sanitized image fixture. Every comparable result must include its SHA-256 and byte length; the baseline observation did not preserve a canonical fixture hash. |
| `cancel-generation` | Stop and recovery | `Write a 400-word plain-text explanation of how a phone can keep a shared document private. Do not use tools.` Use a 1,024-token limit for this workload and press Stop after visible streaming begins. |
| `download-cold` | Storage and model transfer | A fully removed pinned model, then a fresh download from the catalog URL. Record exact bytes and hash. |
| `share-preview` | Product-loop smoke check | Sanitized shared text: `Team sync tomorrow at 10 AM`. Stop after the editable action preview appears; do not tap `Add to calendar`. |

### Pinned model inputs

Use the catalog IDs rather than a display-name search. Capture the final file
SHA-256 because a URL alone does not prove the downloaded bytes. Current catalog
definitions are in [`src/models/catalog.ts`](../src/models/catalog.ts).

| Model ID | Role | Catalog bytes |
| --- | --- | ---: |
| `qwen3.5-0.8b` | Text starter, Q4_K_M | 532,517,120 |
| `qwen3.5-2b` | Text, Q4_K_M | 1,280,835,840 |
| `smollm3-3b` | Text, Q4_K_M | 1,915,306,528 |
| `qwen3.5-4b` | Text, Q4_K_M | 2,740,937,888 |
| `gemma-4-e4b` | Text, Q3_K_M | 4,058,137,728 |
| `smolvlm-256m` | Vision model, Q8_0 | 175,054,528 plus 190,031,616 projector = 365,086,144 total |

Do not replace a pinned model with a different quantization and keep the same
row. Treat it as a new result.

## Repeatable procedure

### 1. Pin the build and device

Record these before running anything:

- UTC timestamp, repository commit, app version, build type (`debug`,
  `development`, or `release`), native/runtime version, and whether Metro is
  involved.
- Manufacturer, exact device model, OS version/build, physical RAM in MiB,
  CPU/ABI, GPU, storage capacity, free storage, battery percentage, charger
  state, display brightness, thermal mode, and background restrictions.
- Model ID, quantization, model URL, model bytes, projector bytes if present,
  SHA-256, context length, maximum response tokens, temperature, top-p, and
  Android GPU setting.
- Network type during download and `offline_after_download: true` for local
  inference. Do not record an SSID.

For the canonical Android baseline, first confirm the AVD configuration and
then use the commands in the [Android E2E instructions](../AGENTS.md#android-emulator-e2e-testing):

```powershell
Get-Content "$env:USERPROFILE\.android\avd\marmot.avd\config.ini" |
  Select-String "hw.device.name|hw.cpu.arch|hw.ramSize|image.sysdir.1"
emulator -avd marmot -no-snapshot -gpu host
adb wait-for-device
adb shell getprop sys.boot_completed
npx expo run:android
```

The existing emulator evidence used a development APK. A release result must
not be merged into the same aggregate without recording the build-type change.
For iPhone rows, use a real iPhone and a reproducible Xcode/EAS build; an iOS
Simulator result is not an iPhone performance number.

### 2. Prepare a clean, safe run

1. Let the device cool to idle, disconnect the charger, set the display and
   brightness consistently, close unrelated foreground apps, and start above
   80% battery. Do not enable a battery-saver or performance mode without
   recording it.
2. Download the pinned model before timing inference. Verify its final hash,
   confirm the app shows the model as ready, and turn networking off for all
   inference workloads.
3. Set context length to **2,048**, maximum response tokens to **128**,
   temperature to **0.70**, top-p to **0.90**, web access off, Agent mode off,
   answer verification off, and Android GPU off. These are the default text
   comparison settings. The cancellation workload explicitly overrides only
   the maximum response tokens to **1,024**.
4. Use one warm-up request that is not included in the aggregate. Record any
   load failure, model swap, app restart, or OS warning instead of retrying
   until a favorable result appears.

### 3. Measure first-token latency and generation speed

Use the device UI as the timing surface. `first_token_latency_ms` means the
elapsed time from the Send tap to the first visible assistant token, not the
time at which a host script guesses that generation started.

1. Start a screen recording with a known frame rate. Record the frame number
   for the Send tap and for the first visible assistant glyph. If device logs
   provide monotonic engine timestamps instead, record the command and use
   that method consistently for every row.
2. Run `text-short` once as a cold run after force-stopping and relaunching the
   app with the model downloaded but not loaded. Then run the warm workload
   five times in fresh chats with the same settings. A warm run begins only
   after the previous response is idle and the model remains loaded.
3. Run `text-steady` five times. Record the app's displayed tok/s and token
   count, plus the first-visible-token time. Prefer raw timing when available;
   otherwise retain the UI statistic and label its source as `ui_stats`.
4. Report every run, the median, and p95. Do not report a speed for a run that
   produced no tokens or was stopped. If a short answer has fewer than 16
   generated tokens, use `text-steady` for speed rather than extrapolating.

For a video measured at a fixed frame rate, calculate
`(first_frame - send_frame) / frame_rate * 1,000` and record the frame rate.
Do not round a single frame result into a false precision claim.

### 4. Measure image evaluation

Use `vision-extract` with a sanitized fixture. Keep the same fixture bytes and
hash across devices. Record the model and projector hashes separately.

1. Download the paired vision model and projector, verify both files, and
   confirm the app shows `Ready for vision`.
2. Attach the fixture, start recording, tap Send, and record first visible
   output, final result, tap-to-result wall time, generated tokens/tok/s if
   shown, skipped frames, peak memory, and any UI unresponsiveness.
3. Repeat three times after one warm-up. If the fixture, capture rate, or timing
   method changes, start a new comparison group.

The existing 40–42 second image-evaluation observation and skipped frames are
useful evidence for prioritization, but they are not a published image
benchmark until this fixture-and-timing procedure is complete.

### 5. Measure storage and model download

1. Remove the target model from the app and verify that no final file or stale
   partial file remains. Record free storage before the download.
2. Start `download-cold` on the recorded network. Record start/end monotonic
   timestamps, progress interruptions, downloaded bytes, final file size,
   final SHA-256, and free storage after completion.
3. Repeat once for a controlled pause/cancel/resume path. A canceled download
   is a cancellation result, not a successful download; do not count it as a
   completed transfer.
4. For a paired model, report weights, projector, total expected bytes, and
   final storage delta separately. Network throughput is a confounder, so
   publish the network type and do not compare download time across networks
   as if it were device inference speed.

### 6. Measure cancellation and recovery

1. Select the pinned model and use `cancel-generation` with a 1,024-token
   maximum. Start recording, send the prompt, and tap Stop two seconds after
   the first visible token. Repeat three times after one warm-up.
2. Record `cancel_to_idle_ms` from the Stop tap until the generation UI is idle,
   whether partial text is retained, whether any late tokens arrive, and
   whether a new short prompt can start within 30 seconds.
3. Run the download pause/cancel/resume check separately when measuring
   storage. Record whether the partial file was cleaned or safely resumed.

A cancellation result passes only when the app returns to idle, no late output
mutates the result, and the next prompt can run. A Stop button that is still
unresponsive after the stop timeout is a blocked run, not a passing slow
result.

### 7. Measure peak memory and battery impact

For Android, sample `adb shell dumpsys meminfo app.marmot.chat` once per second
from before model load through idle. Record peak app PSS and peak `SwapPss`.
For iPhone, use Xcode Instruments or an equivalent device trace and record the
metric name used (physical footprint/resident size) and its peak. Do not mix
Android PSS and iOS physical footprint without retaining their metric labels.

Use a fixed 15-minute battery workload after a cool idle baseline:

- ten `text-steady` requests with the same pause between requests;
- one `vision-extract` run when the model is under test;
- screen awake, charger disconnected, same brightness, networking off after
  download, and no other foreground workload.

Record battery percentage before and after, duration, charger state, thermal
state, and whether the OS reported a low-power or thermal warning. Report
`battery_delta_percent_points` and the workload duration; do not convert a
coarse percentage reading into mAh without an instrumented source.

### 8. Run the share-to-preview smoke check

Use `share-preview` from an external app or the platform share surface. Record
share-to-preview wall time, whether the local attachment/text was grounded,
whether an editable action card appeared, and whether the approval gate was
visible. Do not tap the phone write. This is an end-to-end correctness check,
not a replacement for the isolated text, vision, memory, battery, or download
measurements.

### 9. Aggregate without hiding failures

Keep one record per model, workload, repetition, and device. Publish raw
values, median, and p95 for latency/speed. Include failed, timed-out, and
stopped runs in the result set and explain why they stopped. Never average
different models, build types, device cohorts, or fixture hashes.

## Model-fit recommendation

A fit recommendation is earned per model/device pair; it is never derived from
the cohort name alone. Use these protocol defaults until the project has enough
community data to revise them:

| Recommendation | Required evidence |
| --- | --- |
| `runs-great` | Five of five warm text runs and one cold run complete; at least three cancellation runs recover; no hard stop; peak app memory is at most 50% of physical RAM; p95 first-visible-token latency is at most 5,000 ms; median steady generation is at least 2 tok/s. |
| `works-with-caution` | Required runs complete without an OS kill, OOM, ANR, or swap stop, but one green bound is missed; peak app memory remains at most 75% of physical RAM; p95 first-visible-token latency is at most 30,000 ms; cancellation recovers within 5,000 ms. |
| `too-large-or-unstable` | Any hard stop, OS kill, OOM, ANR, sustained swap condition, no first token by 30,000 ms, Stop not idle by 10,000 ms, or peak app memory above 75% of physical RAM. |
| `pending` | Fewer than the required repetitions, missing hashes/evidence, mismatched fixtures, or an unmeasured real-device/iPhone row. |

For a vision model, add `vision_verified: true` only after three image runs
complete with the same fixture hash and no skipped-frame abort. The current
40–42 second observation therefore remains an observed boundary, not a green
fit label.

## Acceptance thresholds and stop conditions

### A result is accepted for publication when

- the app commit, build type, model/projector hashes, workload settings, and
  fixture hashes are present;
- there are five completed warm text runs plus one cold run, or three completed
  vision/cancellation runs for those specialized workloads;
- raw timing/memory/battery/download evidence is attached or linked;
- failed and stopped runs are included rather than filtered out; and
- the contributor runs `node scripts/benchmark-validate.mjs path/to/result.json`
  successfully.

An accepted record may still have a `blocked` outcome for a model that hit a
stop condition. Acceptance means the evidence is reproducible, not that the
model is fast.

### Stop immediately and record the reason when

| Condition | Action |
| --- | --- |
| No first visible token within 30 seconds of Send | Tap Stop once; if there is no response within 10 seconds, force-stop the app and mark the run blocked. |
| Stop has not returned the UI to idle within 10 seconds | Do not keep waiting or repeat the model; force-stop, capture the evidence, and mark cancellation failed. |
| Android `SwapPss` exceeds 256 MiB for three consecutive samples, or app memory exceeds 75% of physical RAM | Stop the run before the device becomes unresponsive; record the peak and stop reason. |
| OOM, ANR, OS low-memory warning, thermal warning, severe UI freeze, or app process death | Stop and preserve logs/screenshots; the model is not a passing fit result. |
| Battery falls below 20%, charging starts, or the device becomes unsafe to handle | Stop the battery run and record the incomplete duration. |
| A fixture, model hash, setting, or build changes mid-series | Discard the aggregate and start a new result group; never splice runs. |

The canonical emulator’s oversized-model swap behavior is the reason for these
guards. Do not deliberately push a model past a device’s safe memory boundary
just to obtain a speed number.

## Result data schema

Submit one JSON object per model/workload/repetition. A series may be a JSON
array of these objects. Use `null` for a metric that does not apply or was not
measured; never use `0`, `TBD`, or an estimate for missing data.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `schema_version` | string | yes | Exactly `marmot.benchmark.v1`. |
| `result_id` | string | yes | Stable unique ID for this record. |
| `recorded_at_utc` | ISO-8601 string | yes | When the run was recorded. |
| `app` | object | yes | `commit`, `version`, `build_type`, and `native_runtime`. |
| `device` | object | yes | Platform, cohort, emulator flag, manufacturer/model, OS, RAM, CPU/ABI, GPU, and tier override if needed. |
| `model` | object | yes | Catalog ID, quantization, model/projector bytes, URLs, and SHA-256 hashes. |
| `workload` | object | yes | Workload ID, fixture ID/hash, context length, output limit, temperature, top-p, GPU setting, repetition index, and timing method. |
| `measurements` | object | yes | The numeric fields below; fields not applicable to this workload are `null`. |
| `outcome` | object | yes | `status` (`measured`, `pending`, or `blocked`), fit recommendation, stop reason, and notes. |
| `evidence` | array | yes | Repository-root-relative evidence paths, trace names, or PR attachments. Empty only for a pending template. |

The `measurements` object uses these names:

| Field | Unit and definition |
| --- | --- |
| `first_visible_token_ms` | Milliseconds from Send tap to first visible assistant token. |
| `generation_tok_s` | Generated tokens per second after first visible token; retain the source (`ui_stats` or `raw_timing`). |
| `generated_tokens` | Count reported by the app or timing trace. |
| `peak_app_memory_mb` | Peak app memory; pair with `memory_metric` (`android_pss` or `ios_physical_footprint`). |
| `peak_swap_pss_mb` | Peak Android SwapPss; `null` on iPhone. |
| `battery_delta_percent_points` | Battery percentage points consumed by the fixed workload. |
| `battery_duration_ms` | Duration of the battery workload. |
| `download_wall_ms` | Cold download wall time; `null` when download was not measured. |
| `downloaded_bytes` | Bytes downloaded and finalized. |
| `storage_delta_bytes` | Free-storage change after finalization, with temporary files gone. |
| `image_eval_wall_ms` | Tap-to-final-result time for `vision-extract`. |
| `skipped_frames` | Count from the recorded image run; use `null` when not captured. |
| `cancel_to_idle_ms` | Stop/cancel tap to idle UI. |
| `cancel_success` | Boolean recovery result: idle, no late mutation, and next prompt accepted. |
| `share_to_preview_ms` | Share arrival to editable action preview for `share-preview`. |

Minimal pending template (not a benchmark result and contains no invented
numbers):

```json
{
  "schema_version": "marmot.benchmark.v1",
  "result_id": "pending-example-not-a-result",
  "recorded_at_utc": "2026-07-22T00:00:00Z",
  "app": {
    "commit": "replace-with-commit",
    "version": "replace-with-version",
    "build_type": "release",
    "native_runtime": "replace-with-runtime"
  },
  "device": {
    "platform": "android",
    "tier": "android-low",
    "tier_override": null,
    "is_emulator": false,
    "manufacturer": "replace-with-manufacturer",
    "model": "replace-with-model",
    "os_version": "replace-with-os",
    "physical_ram_mb": null,
    "cpu_abi": "replace-with-abi",
    "cpu_model": "replace-with-cpu",
    "gpu": "replace-with-gpu"
  },
  "model": {
    "id": "qwen3.5-0.8b",
    "quantization": "Q4_K_M",
    "model_url": "https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/main/Qwen3.5-0.8B-Q4_K_M.gguf",
    "projector_url": null,
    "model_bytes": 532517120,
    "projector_bytes": null,
    "model_sha256": null,
    "projector_sha256": null
  },
  "workload": {
    "id": "text-short",
    "fixture_id": null,
    "fixture_sha256": null,
    "context_length": 2048,
    "max_response_tokens": 128,
    "temperature": 0.7,
    "top_p": 0.9,
    "android_gpu": false,
    "repetition_index": 1,
    "timing_method": "screen_recording"
  },
  "measurements": {
    "first_visible_token_ms": null,
    "generation_tok_s": null,
    "generated_tokens": null,
    "peak_app_memory_mb": null,
    "memory_metric": null,
    "peak_swap_pss_mb": null,
    "battery_delta_percent_points": null,
    "battery_duration_ms": null,
    "download_wall_ms": null,
    "downloaded_bytes": null,
    "storage_delta_bytes": null,
    "image_eval_wall_ms": null,
    "skipped_frames": null,
    "cancel_to_idle_ms": null,
    "cancel_success": null,
    "share_to_preview_ms": null
  },
  "outcome": {
    "status": "pending",
    "fit_recommendation": "pending",
    "stop_reason": null,
    "notes": "Replace every placeholder and attach raw evidence before submission."
  },
  "evidence": []
}
```

## How contributors submit results

1. Copy the template above into a new file under
   `docs/benchmarks/results/`, using a filename such as
   `2026-07-22-android-pixel-7-qwen3.5-0.8b-text.json`. Keep one device/model/workload
   series together and include raw per-run values.
2. Attach sanitized screen recordings or screenshots, memory/battery traces,
   and download/hash logs. If evidence cannot be committed, attach it to the
   pull request and name it in `evidence`.
3. Run the validator from the repository root:

   ```powershell
   node scripts/benchmark-validate.mjs
   node scripts/benchmark-validate.mjs docs/benchmarks/results/your-result.json
   ```

   With no path, the validator discovers every checked-in JSON result under
   `docs/benchmarks/results/` and rejects duplicate `result_id` values. The
   repository shortcut for this protocol-and-results check is
   `npm run test:benchmark`.

4. In the pull request description, state the exact device row, app commit,
   build type, model/projector hashes, workload settings, number of successful
   and failed repetitions, and any stop conditions. Do not update the matrix
   with a number that exists only in the PR prose; merge the evidence-backed
   result file first.

Reviewers should reject results with missing hashes, mixed builds/settings,
unexplained failures, private data, simulator numbers presented as iPhone
numbers, or emulator numbers presented as real-device numbers.

## Related verification

- [Android UI and on-device verification](verification/android-2026-07-21.md)
- [Flagship share-to-action runtime boundary](verification/flagship-share-vertical-2026-07-22.md)
- [Agent verification history](AGENT.md)
- [Product capability and device-fit context](CAPABILITIES.md)
- [Android emulator procedure](../AGENTS.md#android-emulator-e2e-testing)
