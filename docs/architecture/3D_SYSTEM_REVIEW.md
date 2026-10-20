# 3D system review

Task: **14.6 — 3D System Review**

Date: **2026-10-20**

Reviewed application commit: **95366b5**, with the review-only test and reporting changes in this task.

## Scope and disposition

Review the shared console viewer, six packaging formats and cartridge rendering against PROJECT_SPEC.md §§16–18, 41–45 and 117–122, the [3D architecture](3D_ARCHITECTURE.md) and [packaging architecture](PACKAGING_ARCHITECTURE.md). The current private preview architecture remains suitable for this scope. No new blocking production defect was identified. This task adds repeatable browser evidence and records limitations; it introduces no application behavior, schema, dependencies or future-phase functionality.

## Findings and limits

| Priority | Finding | Disposition |
| --- | --- | --- |
| Medium, existing | Safari native retained-memory stability after extended same-page reopening remains inconclusive. | Keep the accepted Task 9.3 limitation open. Explicit resource disposal and context loss are distinct from native memory reclamation. |
| Low | Cartridge format ranking bounds returned rows but still processes matching catalog rows in PostgreSQL. | No large-catalog latency failure demonstrated. Profile before changing indexes or queries. |
| Low | Curation pages render bounded but potentially large template lists and repeat options for each component. | Current representative workflows pass. Maximum-size curation pages have not been performance-qualified. |

The [physical iPhone record](../performance/3D_PERFORMANCE_IPHONE15.json) and [Task 9.3 analysis](../performance/3D_PERFORMANCE.md#physical-iphone-observations--2026-10-16) remain authoritative for the existing native-memory limitation. That study includes an independent plain-WebGL warning reproduction, but does not prove all viewer retention is browser-owned. This review adds no physical-device measurement and does not close that finding. Android physical testing was explicitly waived by the owner on 2026-10-16; it is not a passed check.

### GPU usage and mobile behavior

The [shell](../../src/components/three/model-viewer.tsx) imports the heavy runtime only after activation. Console grids and inactive details stay static. [Game component selection](../../src/features/physical-editions/components/game-packaging.tsx) mounts one selected viewer; component changes destroy the previous session. The fullscreen fallback replaces a session, while native fullscreen reuses its canvas.

The [runtime](../../src/components/three/model-viewer-runtime.tsx) uses demand rendering, a stable DPR capped at one, at most two million drawing-buffer pixels and hardware dimension limits. Offscreen/background viewing stops rendering and automatic rotation. Live reduced motion disables automatic rotation while retaining manual controls. Context loss ends the session with an accessible retry/static fallback. The existing landscape and drawing-buffer tests remain relevant to every format because camera, canvas sizing and controls are shared.

The [model profile](../../src/lib/three/profile.ts) limits geometry, scene graph, materials, textures and primitive instances before parsing; the first displayed frame also checks actual draw calls against the 80-call limit. Transparent housing is restricted to the authored jewel/Switch contracts, with at most eight blended primitive instances. This constrains work, but does not measure GPU execution time or guarantee frame rate for every admitted model. No shadows, per-card renderers or continuous decorative animation were added.

### Memory ownership and texture loading

[ModelResources](../../src/components/three/model-resources.ts) owns each session's geometries, materials, textures, decoded bitmaps and compositing canvases. Disposal is idempotent; resources resolving after cancellation are immediately released. Loader dependency tracking covers late GLTF allocations. Artwork material clones are owned separately from the shell materials. Artwork compositing backing stores are zeroed on close. [Studio lighting](../../src/components/three/model-stage.ts) releases PMREM scratch targets, room geometry/materials and instanced buffers immediately after baking; only the finished environment target survives until session teardown. R3F owns renderer teardown and context loss.

[The assembled loader](../../src/components/three/box-resources.ts) deduplicates private transfers by asset ID and limits transfer concurrency to two. Transfer bytes are capped at 12 MiB per assembled presentation, including at most 8 MiB of GLB and 2 MiB per artwork image. Artwork headers, dimensions and actual decoded dimensions are checked; sources are limited to 2,048 pixels per edge, composites to 1,024. Unique source pixels and sequential decode/composite work have separate aggregate checks. Each slot gets its own texture so crops/rotations cannot mutate another component or session. ImageBitmaps close immediately after composition; canvas sources remain only for the viewing session. Mipmap-aware texture estimates are admission policy, not measurements of driver allocation.

Private transfer, decode and display-start work has deadlines. These do not preempt synchronous JavaScript inspection/parsing; admission limits bound that work, with deadline checks after preparation. Closing or hiding an unfinished preview aborts it; late decoding cannot restore a closed stage. Unit cases cover failed/late decoding, cancellation, independent material/texture ownership and repeat disposal. Browser checks additionally exercise real WebGL allocation and artwork cleanup across component switches and close/reopen cycles.

### Component architecture and template scalability

Console GLBs, procedural cardboard, authored packaging and cartridges share one runtime, camera, controls, stage and resource owner. Strict versioned content descriptors select the supported loader path; no universal renderer registry is needed. Indexed node/mesh/primitive/material mappings and UV/artwork validation remain outside React. Catalog geometry and per-component artwork are separate records. READY template revisions are immutable, bindings use same-template constraints, and existing assignments retain their selected revision. Cartridge format/variant metadata describes curator-supplied geometry; it neither selects a renderer implicitly nor supplies guessed measurements.

Presentation services authorize reads, verify copy/release revisions and serialize only the selected component descriptor. Private byte delivery rechecks current access independently. Reopening performs fresh private requests; no persistent model/texture cache bypasses authorization. Originals and assembled previews remain private. Owned presence, primary-package reconciliation, public publishing and additional media types remain outside this task.

[Packaging selection](../../src/server/repositories/catalog/physical-editions.ts) retrieves 51 candidates per supported family, displays the latest 50 and separately retains assigned templates. [Cartridge selection](../../src/server/repositories/catalog/physical-media.ts) does the same per controlled metadata format, including legacy `unspecified` rows. The integration fixture with 51 new SNES choices, an older assigned revision, another format and a legacy row verifies that one format cannot crowd out another or hide an assignment.

These bounds allow up to **400 packaging templates** or **650 cartridge templates** including up to 100 retained assignments, before deduplication. They bound response size, not database work or browser DOM cost. The cartridge query ranks matching rows using a JSON format expression; the current family/revision index does not directly order that partition expression. Curation also renders template rows and component selectors from these choices. Before substantially increasing the catalog, capture `EXPLAIN (ANALYZE, BUFFERS)` and real curation-page timings at representative data volumes. Introduce an expression index or per-format lookup only if the plan demonstrates the need; consider server-filtered/paged curation if list/option rendering becomes material. No speculative migration, cache or list redesign is part of this review.

## Verification and evidence

Lint, typecheck, production build, formatting/whitespace and the deferred bundle guard pass. The current unit/component suite passes **1,211 cases in 82 files**, using two workers with unchanged unit timeouts. The focused disposable-PostgreSQL suite passes **21 cases**: 11 physical-media and 10 packaging cases. No personal database migration or live-provider request was performed.

All **50 distinct desktop/mobile browser cases** are verified across the production run and focused rerun. The initial run passed 47 cases; two desktop studies exhausted their 30-second total budget during upload/activation setup, and the mobile five-cycle textured study exhausted its 60-second total budget while closing a session. Traces showed fixture/setup overhead and overall-study timeouts. Those two workflow studies now allow 60 seconds, and the five-cycle software-WebGL study allows 90 seconds; individual loading, idle, cleanup, allocation and heap assertions retain their limits. All six affected desktop/mobile cases pass in a fresh production rerun. The desktop textured rerun took approximately 66 seconds, illustrating why the old total budget was insufficient. No case was skipped or disabled.

The [committed evidence](../performance/3D_SYSTEM_REVIEW_EVIDENCE.json) contains **34 groups**, combining successful initial measurements with the focused rerun. Across the seven assembled formats it records **30 viewing sessions**, stable live graphics allocation counts on reopening, **78 decoded / 78 closed ImageBitmaps**, no frames during the measured settled 500 ms idle windows, one connected active context while viewing, and lost/detached contexts after every close. All still-observable artwork compositing canvases have zero-sized backing stores after close. Explicit deletion counters and context-loss release remain distinct; these observations do not establish native retained-memory stability.

The identified deferred renderer remains **1,011,263 raw bytes / 270,732 gzip bytes**, unchanged from Task 14.5 and below the existing 1,310,720 / 327,680 byte ceilings. The shared oversized-stage, landscape, stable-buffer, visibility, live reduced-motion, throttled-transfer, late-decoder and context-loss regressions pass.

| Project | Fixture | First ready (ms) | Later ready median (ms) | Submission interval p95 range (ms) | Heap drift after forced GC (MiB) |
| --- | --- | ---: | ---: | ---: | ---: |
| Desktop Chromium | Plain | 2343 | 1956 | 33.3–33.3 | 0.43 |
| Desktop Chromium | Shiny | 2547 | 2927 | 250.0–333.3 | 0.44 |
| Desktop Chromium | Textured | 3307 | 3412 | 116.7–216.7 | 1.14 |
| Mobile viewport emulation | Plain | 2054 | 1743 | 16.8–33.3 | 0.36 |
| Mobile viewport emulation | Shiny | 2543 | 4409 | 183.4–299.9 | 0.40 |
| Mobile viewport emulation | Textured | 2341 | 2978 | 100.0–116.7 | 1.15 |

These are instrumented SwiftShader submission intervals, not GPU execution times. Shiny/textured cadence is substantially slower than the archived Task 9.3 software samples; host conditions were not controlled across runs, so this does not establish the cause of that difference. No 30 fps pass or performance parity is claimed. Ready time includes authorization, transfer, parsing, renderer startup and first frame. Heap drift stays below the existing 8 MiB warm-session guard, which measures forced-GC JavaScript heap rather than phone or driver memory.

Reproduce the checks sequentially, with other Prisma-generation and `.next` writers stopped:

```sh
pnpm lint
pnpm typecheck
pnpm exec vitest run --maxWorkers=2
pnpm exec vitest run --config vitest.integration.config.mts tests/integration/physical-media.test.ts tests/integration/packaging.test.ts
pnpm test:e2e:access tests/access-e2e/model-performance.spec.ts tests/access-e2e/model-viewer.spec.ts tests/access-e2e/packaging.spec.ts tests/access-e2e/cartridge.spec.ts
pnpm three:bundle
pnpm three:report --assembled docs/performance/3D_SYSTEM_REVIEW_EVIDENCE.json
pnpm format:check
git diff --check
```

Collect evidence before another Playwright run replaces `test-results`. The report requires all **34 evidence groups**: ten shared-viewer groups and seven assembled-format groups in each Chromium project. It is separate from the historical Task 9.3 evidence. The added test-only artwork probe uses weak references and is never imported by the application. It records decode/close counts and remaining canvas dimensions alongside graphics allocation counters, without asset bytes, URLs or session credentials.

The assembled studies use original synthetic geometry/artwork, reduced motion and a 320-pixel viewport. Desktop/mobile projects run software WebGL on the test host. Zero idle draws, stable allocation counts, closed ImageBitmaps and lost contexts are lifecycle evidence; they do not establish phone GPU time, native retained-memory stability, thermal behavior or performance for maximum-budget curator assets. Prior iPhone interaction evidence concerns the earlier console fixtures, not these new packaging/cartridge shapes.

Task 15.1 is the next planned task and is not implemented by this review.
