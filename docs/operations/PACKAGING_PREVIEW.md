# Private packaging preview

Task 14.2 implements one procedural SNES cardboard box family. A template describes dimensions and six fixed surfaces; each expected release component owns its artwork bindings. The renderer is reusable across releases without sharing mutable materials or textures. No retail dimensions or copyrighted artwork ship as seeds.

## Curate a release

1. As an administrator, open **Game catalog → Game releases → Edit → Manage release packaging**. A release must already contain a `PACKAGING` expected item.
2. Create a draft SNES cardboard template. Supply width, height and depth in millimeters and a measurement source. Mark synthetic demonstration dimensions explicitly. Choose a unique slug and the next family revision number.
3. Review the dimensions and mark the template ready. Ready dimensions, material/camera contracts, metadata and slots cannot be rewritten or deleted. Create a new revision for corrections. Archiving prevents new assignments; retained assignments remain readable. Restore a template to make it selectable again.
4. Upload release artwork, recording its source, author, license, attribution and usage restrictions where known. The standard private image pipeline preserves the original and produces upright WebP display bytes. Upload completion adds an image choice; it does not bind a surface automatically. Existing release/component catalog display images and currently bound images are also available.
5. Select a ready template for an expected component. Assign front, back and spine for complete artwork; the opposite edge, top and bottom are optional. Crops are normalized fractions of the upright image, followed by clockwise quarter-turns and proportional containment. Neutral margins prevent stretching. Saving without a template explicitly detaches all artwork. Changing templates starts an empty binding set.
6. Open an owned game's **Physical packaging** section and select **View in 3D**. Multiple expected boxes have an explicit selector. Front/back buttons, keyboard orbit/zoom/reset, pointer interaction and fullscreen use the existing accessible viewer. Reduced motion disables automatic rotation.

These are **expected catalog components**. Their quantity is catalog information, not a count of owned boxes. Presence and primary-package controls are not active; the copy's manual “has box” answer remains unchanged. This preview does not represent condition or confirm that the pictured box is present.

## Saving and authorization

Only current administrators curate templates or bindings and upload catalog artwork. Current private readers can load the assembled descriptor and private images; neither grants public publication. Descriptors omit storage keys, measurement notes and curator identity. `presentationApproved` stays false at the database boundary.

Assignment, detach, release revision increment and manual metadata history commit together. Retrying an identical saved snapshot does not duplicate history. Stale, conflicting saves retain the form entries and require a refresh. Regular release edits preserve template assignments and reject removing an assigned component or changing its kind until it is explicitly detached. Database composite foreign keys enforce matching component/template/slot identities. Binding references participate in asset-family cleanup checks.

The upload form exposes an explicit completion check when an upload ID is known after an uncertain response. If the network failed before an ID returned, refresh the artwork choices before uploading again. Source and license metadata does not itself authorize publishing an image.

## Viewer limits and fallback

The lightweight page adds no canvas or 3D artwork transfers until activation. The version-2 packaging descriptor coexists with the unchanged version-1 console GLB contract. Each session generates twelve triangles, six independent materials and at most six textures. Physical dimensions set aspect ratios; the shared stage normalizes scale and fits the camera.

Only exact same-origin private PNG/JPEG/WebP resources are accepted: at most 2 MiB each, 12 MiB combined, 2,048 pixels per source edge and 8 million unique source pixels. Actual streamed lengths, MIME types and encoded dimensions are checked before decoding. PNG/WebP animation is rejected. Two transfer workers share a 60-second deadline; composition has a 10-second deadline. Output canvases are at most 1,024 pixels per edge, are not enlarged beyond source resolution, and satisfy a separate cumulative pixel/texture budget while a source bitmap is live.

A missing or unavailable image gives its surface a neutral material and an incomplete-artwork notice. Invalid geometry contracts or aggregate limits preserve static expected contents. Network, decoder, context and access failures close the session and offer the existing retry/static path. Close, component switch, failed load and late decoder completion release session-owned geometry, materials, textures, bitmaps and canvas backing stores. No model/texture cache persists between opens.

Migration `20261020100000_packaging_box` adds the packaging tables and guards. Apply it through the normal migration workflow before using these screens. Implementation checks use disposable PostgreSQL and MinIO; no personal database is migrated by the test runner.

## Verification

Automated coverage includes synthetic dimensions; six face normals, groups and UV origins; crop/turn/contain math; static image headers, animation and truncation; streaming bounds; isolated resources and late cancellation; draft readiness/immutability; private roles and revoked access; stale/no-op writes; composite foreign keys; cleanup lineage; distinct component bindings; and the real upload-to-preview browser flow at 320px with reduced motion. The console viewer regression suite covers shared interaction, context loss, cancellation and lifecycle behavior. Desktop Chromium evidence does not claim performance on a physical phone.

Verified 2026-10-19: lint, typecheck, schema validation, production build, formatting/whitespace and deferred bundle budget pass (1,002,313 raw bytes / 268,033 gzip bytes, under 1.25 MiB / 320 KiB). All 1,121 unit/component, 4 packaging integration, 52 core-schema, 31 asset-pipeline and 18 desktop/mobile packaging/console viewer checks pass. The full integration run initially exposed a missing new FK index and fixture errors; those were corrected and the affected checks rerun successfully. One broader search-plan benchmark still reaches the existing two-second PostgreSQL statement limit (57014). An isolated comparison of unchanged commit `2984960`, including its original migrations/schema, reproduces the same failing EXPLAIN ANALYZE check; the other 101 search tests pass in both comparisons. This task does not change search behavior or relax the production deadline.
