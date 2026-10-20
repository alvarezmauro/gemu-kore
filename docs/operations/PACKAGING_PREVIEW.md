# Private packaging preview

Task 14.2 introduced the procedural SNES cardboard box family. Task 14.3 adds NES cardboard boxes through the same six-face renderer and Genesis clamshells, PlayStation jewel cases and PS2 DVD cases through authored GLB contracts ([Genesis](GENESIS_PACKAGING_AUTHORING.md), [PlayStation](PLAYSTATION_JEWEL_AUTHORING.md), [PS2](PS2_DVD_AUTHORING.md)). A cardboard template describes dimensions and six fixed surfaces; an authored clamshell/DVD case maps three art primitives, and a jewel case also maps an optional opposite-spine surface. Each expected release component owns its artwork bindings. The renderer is reusable across releases without sharing mutable materials or textures. No retail dimensions or copyrighted artwork ship as seeds.

## Curate a release

These steps cover cardboard templates. For authored geometry preparation and approval, use the [Genesis](GENESIS_PACKAGING_AUTHORING.md), [PlayStation](PLAYSTATION_JEWEL_AUTHORING.md) or [PS2](PS2_DVD_AUTHORING.md) authoring guide.

1. As an administrator, open **Game catalog → Game releases → Edit → Manage release packaging**. A release must already contain a `PACKAGING` expected item.
2. Expand **Create packaging template**, choose **NES cardboard box** or **SNES cardboard box**, and create a draft. Supply width, height and depth in millimeters and a measurement source. Mark synthetic demonstration dimensions explicitly. Choose a unique slug and the next revision number within that format. Different formats can each have revision 1. Put the measured market/edition variant in the name and source; neither format assumes universal retail measurements.
3. Review the dimensions and mark the template ready. Ready dimensions, material/camera contracts, metadata and slots cannot be rewritten or deleted. Create a new revision for corrections. Archiving prevents new assignments; retained assignments remain readable. Restore a template to make it selectable again.
4. Upload release artwork, recording its source, author, license, attribution and usage restrictions where known. The standard private image pipeline preserves the original and produces upright WebP display bytes. Upload completion adds an image choice; it does not bind a surface automatically. Existing release/component catalog display images and currently bound images are also available.
5. Select a ready template for an expected component. Assign front, back and spine for complete artwork; the opposite edge, top and bottom are optional. Crops are normalized fractions of the upright image, followed by clockwise quarter-turns and proportional containment. Neutral margins prevent stretching. Saving without a template explicitly detaches all artwork. Changing templates starts an empty binding set.
6. Open an owned game's **Physical packaging** section and select **View in 3D**. Multiple expected boxes have an explicit selector. Front/back buttons, keyboard orbit/zoom/reset, pointer interaction and fullscreen use the existing accessible viewer. Reduced motion disables automatic rotation.

These are **expected catalog components**. Their quantity is catalog information, not a count of owned boxes. Presence and primary-package controls are not active; the copy's manual “has box” answer remains unchanged. This preview does not represent condition or confirm that the pictured box is present.

## Saving and authorization

Only current administrators curate templates or bindings and upload catalog artwork. Current private readers can load the assembled descriptor and private images/models; neither grants public publication. Descriptors omit storage keys, measurement notes and curator identity. `presentationApproved` stays false at the database boundary.

Assignment, detach, release revision increment and manual metadata history commit together. Retrying an identical saved snapshot does not duplicate history. Stale, conflicting saves retain the form entries and require a refresh. Regular release edits preserve template assignments and reject removing an assigned component or changing its kind until it is explicitly detached. Database composite foreign keys enforce matching component/template/slot identities. Binding references participate in asset-family cleanup checks.

The upload form exposes an explicit completion check when an upload ID is known after an uncertain response. If the network failed before an ID returned, refresh the artwork choices before uploading again. Source and license metadata does not itself authorize publishing an image.

## Viewer limits and fallback

The lightweight page adds no canvas or 3D artwork transfers until activation. The version-2 packaging descriptor coexists with the unchanged version-1 console GLB contract. Each procedural box session generates twelve triangles, six independent materials and at most six textures. Authored sessions load their bounded housing and three or four independent art materials. Physical dimensions set aspect ratios; the shared stage normalizes scale and fits the camera.

Only exact same-origin private PNG/JPEG/WebP resources are accepted: at most 2 MiB each, 12 MiB combined, 2,048 pixels per source edge and 8 million unique source pixels. Actual streamed lengths, MIME types and encoded dimensions are checked before decoding. PNG/WebP animation is rejected. Two transfer workers share a 60-second deadline; composition has a 10-second deadline. Output canvases are at most 1,024 pixels per edge, are not enlarged beyond source resolution, and satisfy a separate cumulative pixel/texture budget while a source bitmap is live.

A missing or unavailable image gives its surface a neutral material and an incomplete-artwork notice. Invalid geometry contracts or aggregate limits preserve static expected contents. Network, decoder, context and access failures close the session and offer the existing retry/static path. Close, component switch, failed load and late decoder completion release session-owned geometry, materials, textures, bitmaps and canvas backing stores. No model/texture cache persists between opens.

Migration `20261020100000_packaging_box` adds the packaging tables and guards. Migration `20261020110000_nes_packaging_format` extends their format admission to NES without rewriting existing SNES rows, measurements, slots or bindings. Apply both through the normal migration workflow before using the expanded format controls. Implementation checks use disposable PostgreSQL and MinIO; no personal database is migrated by the test runner.

## Verification

Automated coverage includes synthetic dimensions; six face normals, groups and UV origins; crop/turn/contain math; static image headers, animation and truncation; streaming bounds; isolated resources and late cancellation; draft readiness/immutability; private roles and revoked access; stale/no-op writes; composite foreign keys; cleanup lineage; distinct component bindings; and the real upload-to-preview browser flow at 320px with reduced motion. The console viewer regression suite covers shared interaction, context loss, cancellation and lifecycle behavior. Desktop Chromium evidence does not claim performance on a physical phone.

Verified 2026-10-19: lint, typecheck, schema validation, production build, formatting/whitespace and deferred bundle budget pass (1,002,313 raw bytes / 268,033 gzip bytes, under 1.25 MiB / 320 KiB). All 1,121 unit/component, 4 packaging integration, 52 core-schema, 31 asset-pipeline and 18 desktop/mobile packaging/console viewer checks pass. The full integration run initially exposed a missing new FK index and fixture errors; those were corrected and the affected checks rerun successfully. One broader search-plan benchmark still reaches the existing two-second PostgreSQL statement limit (57014). An isolated comparison of unchanged commit `2984960`, including its original migrations/schema, reproduces the same failing EXPLAIN ANALYZE check; the other 101 search tests pass in both comparisons. This task does not change search behavior or relax the production deadline.

## Task 14.3 — NES increment

NES (`nes-cardboard`) and SNES (`snes-cardboard`) are explicit closed-cardboard contracts. A curator selects the family and supplies measured dimensions and evidence; the application does not infer the format from a platform name or fill in guessed retail dimensions. Both use the existing `box-v1` six-face mapping, neutral cardboard material, crop/rotation policy and resource budgets. Existing version-2 descriptors without a family key are read as the original SNES contract. New descriptors include the validated family in their presentation identity, and template lists and game previews label it explicitly.

Template choices include the latest 50 revisions **per format** plus every assigned template, so a large NES catalog cannot hide SNES choices or a retained older revision. No binding transfers automatically between templates or formats. The same release may explicitly select different supported packaging templates for independent expected components; this does not imply physical containment or owned presence.

This is the first incremental addition in Task 14.3. At completion of the NES increment, Genesis clamshell, PlayStation jewel, PS2 DVD and Switch case support remained pending. See the Genesis increment below for the current authored-case path. Their geometry must represent their housing accurately; they are not offered as differently named cardboard cuboids. No opening animation, authored-case ingestion, media renderer, primary-package controls or public presentation is added here.

Verified 2026-10-20: synthetic portrait NES and landscape SNES fixtures cover all six face normals/UVs, independent textures, crop/rotation/containment, bounded artwork and late cleanup. Integration coverage includes coexistence of ready NES/SNES revisions and artwork on separate components, immutable retained SNES rows, cross-family slot rejection, role checks, idempotent creation, independent revision numbering and bounded per-format choices. Desktop and mobile browser flows cover real attributed uploads, explicit format selection, preserved crop errors, lazy activation, distinct front/back views, keyboard/reduced-motion controls, component switching and revoked access at 320px. No personal database is migrated and no historical packaging measurements are asserted.

Current-increment checks: 1,129 unit/component tests, 6 packaging integration tests, 52 core-schema tests, 8 game-catalog integration tests and 4 desktop/mobile packaging flows pass, along with lint, typecheck, schema validation, production build, formatting/whitespace and the unchanged deferred bundle budget (1,002,313 raw / 268,033 gzip bytes). The broader search-plan benchmark issue recorded under Task 14.2 is unchanged and was not rerun or suppressed in this increment. The Genesis addition follows below.

## Task 14.3 — Genesis increment

Genesis now uses a distinct `gltf-slots-v1` contract with explicit front/back/spine primitives, physical artwork sizes, authored housing and direct private geometry uploads. The [Genesis authoring guide](GENESIS_PACKAGING_AUTHORING.md) describes export rules, review, synthetic fixtures, revisions and budgets. Existing NES/SNES contracts, old descriptors, manual `hasBox` and expected-component semantics remain supported. PlayStation jewel, PS2 DVD and Switch cases remain pending.

## Task 14.3 — PlayStation jewel increment

`playstation-jewel` now uses the existing private authored upload/review path with required front/back/spine artwork and an independently mapped optional opposite spine. Clear housing uses bounded standard PBR alpha blending; artwork remains opaque and neutral when unbound. See [jewel authoring](PLAYSTATION_JEWEL_AUTHORING.md) for mappings, review, synthetic geometry, restrictions and migration. Legacy boxes and Genesis remain supported. PS2 DVD and Switch cases remain pending.

## Task 14.3 — PS2 DVD increment

`ps2-dvd` now uses the reviewed private authored pipeline with three required front/back/spine surfaces and opaque keep-case housing. It retains explicit bindings, geometric/artwork budgets, expected-component semantics and manual `hasBox`. See [DVD authoring](PS2_DVD_AUTHORING.md) for review, synthetic fixtures and migration. Switch remains pending.
