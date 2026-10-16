# 3D performance — Task 9.3

Status: **Software implemented and automatically verified on 2026-10-16; physical-device calibration in progress.**

This task follows [the 3D architecture](../architecture/3D_ARCHITECTURE.md#9-mobile-and-performance-profile), [ModelViewer operations](../operations/MODEL_VIEWER.md) and specification §§18 and 117–120. Keep the interactive-v1 limits provisional until physical iOS Safari and Android Chrome measurements exist. Automated viewport emulation does not establish phone GPU performance.

## Implementation and scope

- Keep the existing client-only dynamic import behind explicit activation. No speculative GLB loading, shared private model cache, extra renderer or decoder/environment download is introduced.
- Reject a descriptor above the 8 MiB interactive limit before importing the rendering runtime. The stored original and private download remain available.
- Show accessible byte-based download progress, followed by separate preparation and display-start states. Parsing has no invented percentage. Yield once before synchronous inspection so loading feedback and Close can paint.
- Recheck document visibility when the runtime mounts, including an activation response arriving after the tab was hidden. Preserve demand rendering, offscreen pauses, stopped auto rotation and current authorization on reopen.
- Use the shared drawing-buffer limit when calculating DPR. Cap the drawing buffer at two million pixels and the hardware dimensions after a very large resize or Canvas scroll reconfiguration. Keep DPR stable at one during both interaction and rest, subject to that cap. The initial motion/rest DPR experiment was removed after the physical iPhone flicker report; changing resolution during damping adds drawing-buffer resets without a demonstrated performance gain.
- Position the Canvas wrapper absolutely inside the bounded stage. Its measured height must follow the actual `max-height` in landscape, so camera fitting and the visible stage use the same aspect ratio. Keep the expanded dialog content aligned at the top and scrollable.
- Retain collection image thumbnails and neutral placeholders in both grid/list views. Existing private image selection/provenance remains unchanged. This task does not generate new thumbnail Assets or make models public.

The task verifies the existing per-session disposal design rather than adding a second cache or manually disposing a renderer owned by R3F. The test/manual probe is never imported by the application. No dependency, database, catalog, public endpoint or hero redesign is needed.

## Reproduce the evidence

From the repository root, run these sequentially with other `.next` writers stopped:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm exec vitest run --config vitest.integration.config.mts tests/integration/consoles.test.ts
pnpm test:e2e:access tests/access-e2e/model-performance.spec.ts tests/access-e2e/model-viewer.spec.ts tests/access-e2e/console-crud.spec.ts
pnpm three:bundle
pnpm three:report
pnpm test:e2e
```

Collect the report before another browser run replaces `test-results`. `three:report` requires all ten performance evidence groups from both Chromium projects and writes [3D_PERFORMANCE_EVIDENCE.json](3D_PERFORMANCE_EVIDENCE.json). It records the source base commit plus the presence of local task changes; it does not imply those uncommitted changes belong to the base commit.

`three:bundle` finds the pinned renderer/loader chunks using explicit vendor/application sentinels and measures raw/gzip bytes. The initial guard is **1,280 KiB raw / 320 KiB gzip** across those identified chunks. These are bundle regression ceilings with headroom over the measured baseline, not a phone loading guarantee. Reassess the sentinels and import graph on vendor/bundler upgrades; do not silently raise the ceilings. Runtime network assertions independently prove those chunks and GLB requests are absent from grids and inactive detail pages.

## Automated observations — 2026-10-16 (layout/stable-DPR fixes)

The updated production build passes lint, typecheck, formatting, **750 unit/component cases** and **36 focused viewer/performance browser cases** across desktop/mobile Chromium. Earlier Task 9.3 validation also passed 32 console PostgreSQL cases, console browser regressions and 44 general UI cases. The refreshed evidence contains **20 groups**, including landscape geometry and a stable drawing-buffer test. Camera/stage dimensions and centers match exactly in portrait, landscape and the expanded dialog. Orbit and settling produce **zero buffer-dimension writes**; the subsequent four-second idle window adds **zero model frames**. The user also confirms the subsequent physical Safari retest works for landscape centering and post-interaction flicker; this is a visual confirmation, separate from the automated measurements.

The identified deferred renderer/loader is **995,607 raw bytes / 265,878 gzip bytes**, within the explicit bundle regression ceiling. Grids and inactive detail pages request none of that chunk and create no model context. The oversized-stage check settles at **1,998,984 drawing-buffer pixels**. Idle/offscreen checks pass; simulated background and live reduced motion stop rotation. Every closed benchmark session reaches context loss, active allocations stay bounded and the measured warm-session heap drift remains below the 8 MiB guard.

These are instrumented SwiftShader observations with trace recording, not phone performance. "First ready" and "later ready" include the authorized action, private transfer, parse, renderer and first-frame work; they are not isolated GPU timings.

| Project                   | Study    | First ready (ms) | Later ready median (ms) | Submission interval p95 range (ms) | Used-heap drift after forced GC (MiB) |
| ------------------------- | -------- | ---------------: | ----------------------: | ---------------------------------: | ------------------------------------: |
| Desktop Chromium          | plain    |             1078 |                     780 |                          16.7–16.7 |                                  0.42 |
| Desktop Chromium          | shiny    |             1287 |                     948 |                          50.1–50.1 |                                  0.39 |
| Desktop Chromium          | textured |             1246 |                     879 |                          33.4–33.4 |                                  1.17 |
| Mobile viewport emulation | plain    |             1089 |                     770 |                          16.7–16.7 |                                  0.34 |
| Mobile viewport emulation | shiny    |             1298 |                     950 |                          50.1–50.1 |                                  0.34 |
| Mobile viewport emulation | textured |             1210 |                     870 |                          33.4–33.4 |                                  1.16 |

The superseded motion-DPR experiment reduced drawing pixels to approximately 56% of resting resolution without demonstrating an FPS gain. The current build keeps resolution stable during movement and rest. The translucent study's software cadence remains below the physical-device 30 fps target; no phone FPS pass is claimed from software-renderer results.

## Physical iPhone observations — partial, 2026-10-16

The first real-device study is recorded in [the iPhone evidence](3D_PERFORMANCE_IPHONE15.json). Safari's connected-device panel identifies an **iPhone 15 / iOS 26.6.2**; its user agent reports **Safari 26.6.1** and a frozen OS token, preserved separately in the evidence. The phone uses Apple GPU, a 393 × 735 CSS-pixel viewport, DPR 3, local Wi-Fi and USB remote inspection. Device power/thermal conditions have not yet been recorded.

For the original 744-byte plain fixture, the first observed activation reaches ready in **1,937 ms**. Ten same-page reopens take **210–358 ms** with the runtime already imported. The user supplied real touch input: the probe records **546 submitted frames over 10,001 ms**, **573 trusted pointer moves** and **17 ms p50/p95 submission intervals**. Native Safari Timelines independently records **600 browser rendering frames** in the corresponding ten-second touch window, with **16.56 ms p50 / 16.96 ms p95 / 32.53 ms maximum** frame durations. These are browser frame/submission measurements, not GPU execution times or proof about every mobile device.

In this pre-fix run, the drawing buffer drops from **77,361 to 43,440 pixels** during motion and returns to 77,361 at rest. An untouched 2,001 ms window produces **zero additional model frames**. All eleven sessions (the manual session plus ten scripted reopens on the physical phone) close with lost/detached contexts. Live allocation counts remain stable across reopens; this does not yet establish a native retained-memory trend.

The shiny/translucent fixture (65,536 triangles, 1,455,132 bytes) reaches ready in **969 ms** on its first observed activation; ten same-page reopens take **248–436 ms**. The runtime/browser cache state differs from the first plain activation, so do not read this as a controlled load-time comparison. Real touch input produces **545 submitted frames over ten seconds**, with **17 ms p50 / 18 ms p95** intervals. The native touch window records **596 browser frames**, with **16.64 ms p50 / 17.75 ms p95 / 22.96 ms maximum** durations. Explicit auto rotation produces **601 submitted frames in 10,003 ms**, with 17 ms p50/p95 intervals. Graphics allocations stay stable through ten reopens, and all eleven contexts close. Post-rotation damping is recorded separately from settled idle: five successive two-second windows contain 47, 7, 0, 0 and 0 model frames. Drawing stops within the first four seconds and remains stopped for the final six seconds. Two further post-stop checks also close their contexts successfully.

The textured fixture (65,536 triangles, 2,048 × 2,048 image, 1,543,320 bytes) reaches ready in **1,257 ms**; ten reopens take **322–498 ms**. Real touch input produces **553 submitted frames in ten seconds**, with 17 ms p50/p95 intervals. The native window records **600 browser frames**, with **16.51 ms p50 / 17.12 ms p95 / 22.25 ms maximum** durations. Explicit auto rotation produces 601 submitted frames in ten seconds, also at 17 ms p50/p95. Both an untouched window and a window after four seconds of rotation settling contain zero model frames. All eleven contexts close, allocation counts stay stable, and a test-only native bitmap wrapper confirms **11 images decoded / 11 images closed**. This confirms explicit bitmap release; native retained-memory trends are a separate check.

The user initially reported that all three models looked fine without stuttering. A subsequent landscape test showed the model clipped below the stage center and revealed flickering for minutes after interaction stopped. After the Canvas layout and stable-DPR fixes, a fresh isolated production session was provided for the same landscape and move/stop checks. The user confirmed **“now is working fine”** on 2026-10-16. This closes the two reported visual defects for that iPhone retest; it supplies no new cadence, memory or thermal measurement. Charging, Low Power Mode and thermal conditions remain unspecified.

The native recording also exposes an approximately **1.33-second frame during initial activation**, with approximately 1.28 seconds attributed to script. Keep this first-start cost visible rather than folding it into the settled interaction result. Native screenshots/CPU/network/frame recording and the probe add overhead. Raw exports stay ignored and owner-readable because they can include the disposable session cookie; the committed evidence contains only selected numeric observations and non-sensitive device metadata.

A second batch of ten textured reopens closed all 22 accumulated contexts and ImageBitmaps according to the probe. However, native Memory rose by 24,592,384 bytes overall (Page category +34,072,353 bytes), and Safari issued context-quota/already-lost-context warnings during that extended run. This is inconclusive for retention and requires investigation including instrumentation overhead; it is not a native-memory pass. Real offscreen testing recorded zero draws over two seconds, and multiple real background returns stopped auto rotation.

This is **partial calibration**. The landscape and post-interaction flicker retest is user-confirmed. The remaining plain auto-rotation sample, live reduced motion, loading/cancellation and native-memory/context-quota investigation remain pending. Android is also pending. No full phone-performance pass is justified by the short interaction windows alone.

## What the tests measure

| Check                | Evidence and limit                                                                                                                                                                                                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deferred rendering   | No identified renderer chunk, model GET or WebGL context before activation; real private photo thumbnails render in grid/list views.                                                                                                                                              |
| Rest and visibility  | Draws settle after damping; no continuing draw frames in measured idle/offscreen windows. Background-state coverage dispatches a simulated visibility change; real phone background behavior is still required. Reduced motion stops an active rotation.                          |
| Graphics lifetime    | One connected active stage. Every closed session reaches context loss through R3F teardown. Explicit create/delete counters and context-loss release are recorded separately. Retiring detached contexts may exist briefly during R3F cleanup; no second active stage is allowed. |
| CPU lifetime         | Chromium heap snapshots after forced GC track warm-session used/backing storage. The used-heap drift guard is 8 MiB over the tested sessions. This is neither reserved heap capacity nor OS/GPU memory, and forced-GC behavior is not a production guarantee.                     |
| Landscape/stability  | Portrait → landscape → expanded dialog → portrait keeps canvas and stage dimensions/centers aligned. Orbit and settled rest must not reset drawing-buffer dimensions; a sustained four-second idle window adds no frames.                                                         |
| Drawing resolution   | An oversized 4,000 × 2,500 CSS-pixel stage stays within two million drawing-buffer pixels.                                                                                                                                                                                        |
| Loading/cancellation | Throttled real private transfers show bounded progress and can be closed. A delayed texture decoder finishing after close releases its ImageBitmap and never resurrects a stage.                                                                                                  |
| Render cadence       | Instrumented draw submissions are grouped by animation-frame timestamp. Reports contain p50/p95 submission intervals during explicit rotation, plus activation-to-ready time. They do not measure GPU execution time or display presentation.                                     |

The probe uses weak references for contexts/resources, retains numeric counters and the graphics-backend name, and sends no network traffic. It records no collection titles, serials, notes, asset IDs, resource URLs or model contents. Instrumentation and Playwright trace recording add overhead. These runs identify SwiftShader, a software renderer. Reports are local test observations, not production telemetry or physical-device measurements. The heavier translucent fixture can remain below the physical-device 30 fps target in this software environment; that must not be presented as a passed phone benchmark.

## Original study fixtures

```sh
pnpm three:fixtures
# Optional: pnpm three:fixtures /absolute/output-directory
```

The default writes ignored files under `test-results/three-fixtures`; it never uploads to your collection. Output includes byte lengths, triangle/pixel counts and SHA-256 values. All geometry/artwork is original procedural test material, with no downloaded console models or redistribution assumptions.

| Fixture        | Purpose                                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `plain.glb`    | Four-triangle asymmetric shape; interaction, baseline load and cleanup.                                                |
| `shiny.glb`    | 65,536-triangle torus study with shiny, double-sided translucent material; extra transparency passes and PBR work.     |
| `textured.glb` | The same mesh with a 2,048 × 2,048 original checker texture; image decoding, texture allocation and repeated disposal. |

Plain/shiny cases reopen twice; the textured case reopens five times per automated project. These fixtures exercise content classes and limits; they are not a complete library of real collection models or network compression characteristics.

## Physical-device calibration — required to finish Task 9.3

Use an existing authorized HTTPS environment reachable by the devices, or the isolated local runner below. The Mac's `localhost:3002` is not a phone's localhost. Do not expose the private app publicly or change OAuth origins simply to obtain benchmark numbers. Network/deployment setup, if needed, should be handled explicitly.

### Isolated local device runner

When a phone is available on the Mac's trusted Wi-Fi network, run:

```sh
pnpm three:device <Mac-private-Wi-Fi-IPv4-address>
```

The explicit address must belong to this Mac and be in a private IPv4 range. The runner binds HTTPS port 3443 only to that address. It creates disposable PostgreSQL/MinIO containers, temporary test TLS and a separate production application on loopback port 3130 (storage TLS on loopback 3132). It uses the existing test infrastructure, never the development database/storage or real OAuth credentials. Stop other host `.next` writers before starting it; the Docker development app uses separate output volumes and can keep running.

It prepares the three original fixtures through normal authenticated upload/selection, changes the disposable account to VIEWER, then verifies that upload controls disappear and a real private model still renders. The entry form at `/__device/start` exchanges a one-use, eight-digit code for a signed session in the disposable database. Entry requires the exact local origin, expires after 15 minutes and permits five attempts per minute. The connection details/certificate fingerprint are saved in ignored `test-results/physical-device/connection.json` with owner-only permissions. Treat the code as temporary test access. `/__device/studies` lists the three copies; `/__device/probe.js` serves the diagnostic script only to that test session. The probe still requires installation through remote DevTools before activating each page's 3D viewer.

The one-day local certificate is self-signed. Safari may show a certificate warning; the device owner must handle that browser security step themselves, after checking the exact private address and test certificate. The runner does not install a certificate authority, change device/network settings, disable application auth/CSRF or change production OAuth configuration. Do not enter real OAuth credentials into this fixture environment.

The entry page uses `Referrer-Policy: same-origin`, preserving the Origin header for native form submissions without sending referrers to other origins. `no-referrer` can make basic form POST origins null, which the exact-origin guard correctly rejects ([Origin header behavior](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Origin)). Errors have an explicit text content type so iOS displays an explanation rather than treating the response as an unknown download. Before publishing the phone code, the runner verifies a real browser form's incorrect-code response, successful cookie/redirect flow, private study access, one-use replay rejection and foreign-origin rejection. It then discards the verification code and issues a fresh phone code.

The runner stops automatically 90 minutes after startup, or on interrupt/termination, and cleans up its app process, listeners, temporary TLS files, database, storage and connection details. A forced process kill or host shutdown can prevent cleanup; disposable containers carry the existing `gemukore.test=true` label. A subsequent run has a fresh secret/session and code. Starting this environment establishes reachability and fixture setup only; physical performance remains pending until the measurements below are recorded.

### Measurement procedure

1. Record the physical device model, OS, browser/version, viewport, actual drawing-buffer size and power/thermal state. Test Safari on iOS and Chrome on Android; record whether the network is Wi-Fi or cellular and its conditions.
2. Generate the three fixtures above. In a private test copy, upload/select one at a time. Keep test artwork identified as synthetic; it must not become canonical/default console artwork. Record the printed asset hash and byte/triangle/pixel counts.
3. Install [the probe](../../scripts/three-performance-probe.js) in remote browser DevTools before activation. Record cold and warm activation-to-ready timings for five runs per fixture, with runtime/network cache state stated explicitly. Private model fetches remain no-store.
4. Call `window.__gemu3dProbe.startSample()`, orbit/zoom for ten seconds, then call `window.__gemu3dProbe.stopSample()`. Repeat with explicit auto rotation. Record p50/p95 intervals, observed interaction responsiveness and any stalls. The architectural target is at least 30 fps during interaction; inspect browser performance tooling as well as submission cadence.
5. Stop interacting and verify no ongoing model draws. Scroll the stage away, background the browser for 30 seconds, return, and change reduced motion while rotating. Rotation must stay off after either pause or preference change. Manual controls remain usable.
6. Open/close ten times, allowing teardown to settle. Inspect `window.__gemu3dProbe.snapshot()` and browser memory/resource tooling. Record stable warm-session trends, ImageBitmap/texture release, context losses, errors and any upward retained-memory trend. Do not require every internal browser counter to become zero.
7. Test narrow portrait, landscape and fullscreen, a slow transfer and close during loading. Preserve the poster/metadata/download on unsupported/over-budget content. Remove private test-copy links through the normal UI afterward if desired.

| Required device         | Device / OS / browser                     | Result                               |
| ----------------------- | ----------------------------------------- | ------------------------------------ |
| Physical iOS Safari     | iPhone 15 / iOS 26.6.2 / Safari UA 26.6.1 | Partial: all three fixtures measured |
| Physical Android Chrome | Not yet provided                          | Pending                              |

If a phone fails, first lower the common drawing/asset limits or simplify the problematic asset. Record the before/after fixture and measurements. Add no device database, automatic-quality framework, persistent private cache or extra rendering service without evidence that the simpler fixes are insufficient.

The pre-adjustment observations are preserved in [3D_PERFORMANCE_BASELINE.json](3D_PERFORMANCE_BASELINE.json). The current report records stable DPR and graphics backend. The initial motion-DPR measurements are superseded; these runs are diagnostic observations rather than a controlled hardware A/B experiment.

The implementation uses [Next.js conditional lazy loading](https://nextjs.org/docs/app/guides/lazy-loading), [R3F demand rendering](https://r3f.docs.pmnd.rs/advanced/scaling-performance) and [R3F renderer ownership](https://r3f.docs.pmnd.rs/api/canvas). Exact APIs were checked against the pinned packages; source-selection and admission limits are GemuKore policy.
