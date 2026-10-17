# Consoles phase review

Task: **10.3 — Consoles Phase Review**  
Date: **2026-10-17**  
Reviewed application commit: **4d535bd**  
Disposition: **Architecturally sound for the current private-console scope. No blocking findings or required production-code fixes.**

This review covers Tasks 8–10 against PROJECT_SPEC.md, DEVELOPMENT_PLAN.md, DESIGN.md and the accepted domain, repository, storage and 3D architecture. It does not implement Phase 11 or claim that future public delivery or physical-edition rendering already exists.

## Findings

| Severity | Result                                                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Critical | None identified.                                                                                                                                 |
| High     | None identified.                                                                                                                                 |
| Medium   | No new finding requiring correction before Games. Existing physical-device limitations remain explicitly accepted, below.                        |
| Low      | The detail read loads the full location-management projection to build labels; follow up only if collection/location growth makes this material. |

### L01 — Location-label reads include unused management counts

**Location:** `src/server/services/collection/console-management.ts:110` and `src/server/repositories/locations.ts:7`.

`getOwnedConsole` calls `listLocationRecords` and builds the hierarchy for every detail read, including read-only viewers. That shared repository projection includes descriptions, timestamps and child/item counts; the detail page needs path labels, and viewers do not receive edit choices. This introduces unnecessary count work and makes detail-read cost grow with the complete location tree. It does **not** leak that tree to viewer props: the service returns an empty choices array for viewers and only the selected path in the detail DTO.

**Recommendation:** when measurements justify it, add a narrow hierarchy-label projection for selectors and resolve only the selected ancestor path for read-only details. Preserve server authorization, deterministic hierarchy order and cycle protection. Do not truncate a hierarchy before resolving its parents.

**Disposition:** nonblocking; no performance failure or hobby-scale requirement violation was demonstrated. Avoid changing shared location services or introducing a path cache solely for this review.

## Architecture assessment

### Schema and domain integrity

- `ConsolePlatform` and `ConsoleModel` are distinct canonical entities. Models explicitly link commercial markets through `ConsoleModelRegion`; region locking and copy observations remain separate.
- `OwnedConsole` links a physical `CollectionItem` to one model. Composite foreign keys, fixed child types, deferred required-subtype triggers and immutable root type protect the aggregate in PostgreSQL, beyond Prisma's optional relation shape. Multiple copies of a model are supported.
- Restrictive catalog/location references protect used identities; copy deletion cascades through its owned subtype, defects and media uses while retaining canonical records and stored assets. Primary override selection has a partial unique index.
- Shared companies, assets, provenance and publication controls are reused. No duplicate default-model columns, universal entity identity or per-copy canonical market override has been introduced.

Evidence: [schema](../../prisma/schema.prisma), [core migration](../../prisma/migrations/20261004070000_core_catalog_collection/migration.sql), [asset migration](../../prisma/migrations/20261004170000_asset_upload_pipeline/migration.sql).

### CRUD, authorization and concurrency

- [Console services](../../src/server/services/collection/consoles.ts) validate strict server input, reject mismatched model/platform identities and archived new selections, validate locations and create the private root/subtype/defects atomically.
- A client-generated save reference supports retrying uncertain creation. An existing reference is accepted only for the same creator and matching persisted copy/model/defect contents; a conflicting request cannot overwrite the saved copy.
- [Mutation services](../../src/server/services/collection/console-management.ts) recheck permission after dependency/root locks, reject stale aggregate/catalog revisions and distinguish no-ops from meaningful changes. Meaningful changes to a published copy return it to private. Canonical corrections remain a separately authorized admin operation.
- Overrides are scoped to the selected copy; another copy's use cannot be activated or removed. Ordinary photos cannot become overrides. Upload recovery does not silently create another copy or repeatedly upload an uncertain file.
- Private page, Server Action, presentation and byte-delivery requests each obtain/revalidate server identity. A known asset ID or a previously issued viewer descriptor is not treated as authorization. Public publication remains a separate future query/delivery contract.

Evidence: [actions](../../src/features/consoles/actions.ts), [validation](../../src/features/consoles/validation.ts), [presentation service](../../src/server/services/collection/console-presentation.ts), [private delivery](../../src/server/http/assets.ts), [integration cases](../../tests/integration/consoles.test.ts).

### Queries and UI boundaries

- Repositories use explicit projections. Catalog lookup inputs are parameterized/literally escaped; results and override pages are bounded and deterministically ordered. Current primary overrides are fetched separately so paging does not hide the selected resource.
- Detail DTOs distinguish canonical information, private physical observations, gallery sources and selected overrides. Storage keys, namespaces, hashes and audit actors are not serialized into them. Photo and defect lists are bounded and link to their existing management flows.
- The console route/detail presentation remain Server Components. Forms, upload recovery, image fallbacks, viewer controls and the hash indicator are focused client islands. Data access and authorization stay out of UI code.
- Section navigation uses ordinary anchors with keyboard/history/reload support. Magic UI presentation remains bounded, keeps content visible before hydration and honors live reduced motion. The Task 10.2 Blur Fade cleanup correction is already part of the reviewed commit.

Evidence: [repositories](../../src/server/repositories/collection/console-management.ts), [console route](../../src/app/app/consoles/[id]/page.tsx), [detail component](../../src/features/consoles/components/console-detail.tsx), [animation strategy](../operations/ANIMATION_STRATEGY.md).

### R3F, resource lifetime and performance

- The shell dynamically imports the renderer only after explicit activation. Static grids and inactive detail pages do not create a Canvas or download the GLB. Fullscreen/dialog expansion replaces the session rather than keeping a second active canvas.
- Resource descriptors use validated same-origin private URLs. Byte length, MIME, redirect policy, transfer ceilings and cancellation are checked before parsing. The interactive profile independently restricts extensions, external resources, graph structure, geometry, draw calls and embedded image dimensions before decoder/WebGL work.
- Session ownership covers geometry, materials, textures and ImageBitmaps, including allocations resolving after cancellation. Camera fitting is normalized and bounded. Reflection-bake scratch resources are released immediately, with only the baked target retained for the session.
- Demand rendering settles at rest; hidden/offscreen viewing pauses and disables automatic rotation. Reduced motion retains manual interaction. Drawing resolution is bounded, and loading failures, context loss and unsupported files retain static/download/retry paths.
- No cache, universal renderer registry or renderer instance per collection card is needed at the present scale.

Evidence: [shell](../../src/components/three/model-viewer.tsx), [runtime](../../src/components/three/model-viewer-runtime.tsx), [resource owner](../../src/components/three/model-resources.ts), [stage](../../src/components/three/model-stage.ts), [profile](../../src/lib/three/profile.ts), [performance evidence](../performance/3D_PERFORMANCE.md).

### Compatibility with Games

The existing `Game` / `GameRelease` and `OwnedGame` relationships are compatible with this console pattern. Reuse the collection aggregate, revision/permission/publication rules, asset lifecycle and viewer stage; retain feature-specific validated inputs and projections. Console identification is not a release/edition selection workflow and should not become the generic game form.

Physical packaging/media needs explicit release-component/template/texture bindings when Phase 14 arrives. Add that content adapter at the planned boundary; do not store personal condition on a catalog release, create nested inventory prematurely or duplicate the canvas/controls/resource owner. Current private-only media contracts must not be repurposed as public delivery without the Phase 18 context/policy checks.

## Accepted limits and follow-up triggers

- Physical Android testing was explicitly waived by the owner during Task 9.3. Android compatibility is unverified, not a passed test.
- Extended Safari native-memory retention remains inconclusive. Released application resources and Chromium idle/cleanup assertions do not establish stable native memory on every device. Revisit if normal use shows sustained growth, context failures or crashes.
- Admission ceilings remain conservative/provisional; software-renderer timings are not phone benchmarks. Existing static fallbacks and explicit context-loss recovery remain necessary.
- No fresh phone measurements, public privacy implementation or packaging renderer is claimed by this review.

These are recorded in [Task 9.3's evidence](../performance/3D_PERFORMANCE.md), not newly discovered blockers or reasons to add speculative caches/services.

## Verification

Fresh review checks on 2026-10-17:

- `pnpm db:validate` — passed.
- `pnpm lint` and `pnpm typecheck` — passed.
- Review-document formatting and diff whitespace — passed.
- `pnpm test src/lib/three src/components/three src/features/consoles/validation.test.ts src/server/db/repository-boundaries.test.ts` — 76 cases passed across eight files.
- `pnpm test:integration tests/integration/consoles.test.ts tests/integration/core-schema.test.ts` — 84 cases passed across two files, using disposable PostgreSQL.
- `pnpm three:bundle` — existing production output passed its configured renderer limits: 995,680 raw bytes and 265,900 gzip bytes, below 1,310,720 / 327,680. This inspects the existing build; it is not a fresh performance benchmark.

The reviewed commit also contains Task 10.2's recorded production builds, console/viewer browser checks, shared motion checks and screenshot inspection. Browser and physical-device measurements from those tasks are prior evidence; they are not presented as fresh runs in this documentation-only review.

No application code, dependencies, schema or migrations were changed. There are no Critical, High or justified Medium fixes to apply. Task 11.1 may begin when explicitly requested.
