# Collection photos

Task 6.3 adds the private photo manager at `/app/media`, linked from the private entry page and workspace navigation. Photos belong to an owned `CollectionItem`, not the canonical catalog. It reuses the Task 5.3 upload pipeline and existing schema. There are no new dependencies, migrations or development fixtures.

## Using the manager

Choose an existing **Collection copy**, then **View copy**. Canonical identity and a short copy ID distinguish identical copies. Owned consoles, games and accessories are supported. An empty collection does not create placeholder copies or detached photos; collection-item creation remains in its assigned phase.

Editors and administrators can upload, classify, describe, reorder and remove photos. Viewers can inspect them. **Choose photos** selects one or several library files; **Take a photo** uses a separate input with `capture="environment"` to request the rear camera where the browser/device supports it. Desktop browsers may open a normal picker. Real device camera capture still depends on the operating system; browser tests verify the input and actual upload flow, not camera hardware.

Supported inputs remain JPEG, PNG, WebP and AVIF, up to 25 MiB and 64 million pixels each, with one frame. HEIC is not supported: convert it to JPEG first. Client checks provide early feedback; the server independently validates the decoded bytes and resource limits. Camera/library inputs do not introduce a new decoder or upload endpoint.

Classifications are Photo, Front, Back, Left, Right, Top, Bottom, Serial number, Box, Damage and Other. The upload selection applies to that batch; individual photos can be reclassified afterward. Captions are optional, up to 2,000 characters. Image descriptions are optional, up to 1,000 characters, and supply alternative text. Empty trimmed descriptions become null; alternative text falls back to the caption or classification plus copy identity.

The gallery uses contained thumbnails and a dialog for the larger display image. Drag the handle with a mouse or touch to reorder. Move earlier/later buttons provide the same operation for keyboard users and when a destination is outside the viewport. Only the handle prevents touch scrolling; other gallery areas remain scrollable. Ordering is saved immediately after a drop or button action and announced. Custom logo/model roles are excluded from this manager and its ordering operations.

Removal requires confirmation and detaches only this copy's use. It does not delete stored originals, derivatives, provenance or another copy's use of the same file. Unreferenced-file cleanup remains the explicit operator capability documented in [ASSET_UPLOADS.md](ASSET_UPLOADS.md).

## Upload progress and recovery

Files are sent sequentially as raw bodies to `POST /api/uploads`; there is no client multipart buffer or parallel decoder queue. Native XHR progress reflects actual byte transfer. Unknown transfer lengths use indeterminate progress. Finishing transfer changes the message to **Processing and saving**; it is not reported as saved until the server confirms completion. The gallery refreshes after the batch.

A failed or uncertain upload stops the rest of that batch. Remaining files are explicitly labeled as not uploaded. Files are never silently retried. Where a recoverable response includes a validated reservation ID, **Check upload** calls the existing idempotent completion endpoint without resending the image. Invalid-image rejections do not offer completion of a failed reservation. If the response was lost and no ID is available, refresh to check saved photos before uploading the same file again. Check failures retain their recovery ID and explanation.

## Data and authorization

The Server Component page authenticates the real session. Server Actions and upload routes authenticate independently, and services check the current `media.manage` permission. No role or actor is accepted from form data. Reads require current private access; upload completion and photo mutations recheck grants/sessions after a lock wait.

Gallery reads use one repeatable-read snapshot for the copy revision and photo list. The private DTO includes only copy labels, revision, photo-use identity/classification/descriptions, dimensions, approval label and authenticated image paths. It excludes storage locators, original filenames, manifests, checksums, uploader identity, private item notes and serial fields. Thumbnail resolution uses the pipeline's READY display sibling and its recorded resize lineage, falling back to the private display image.

Every edit, removal and reorder includes the opening copy revision. The service locks the collection root, rechecks permission, validates IDs within that exact copy and advances revision/actor atomically. Reordering requires the entire current photo set with unique IDs; missing, foreign and custom-role IDs are refused. No-op content/order changes leave the revision unchanged. Shared image assets are locked consistently before reorder use updates. This avoids conflicting lock orders between copies that share files.

Upload completion takes the same root-before-asset lock order, appends a new use after the existing media order and advances the aggregate revision exactly once. Idempotent completion returns its existing result without a second revision increment. Storage/decoder work remains outside database transactions. Defect management now shares the same small collection identity, row-lock and revision repository helpers; its behavior is unchanged.

## Privacy and publication

All uploads start with private, unapproved uses and unknown asset rights. Originals remain private. The manager uses authenticated, no-store image routes with Next Image optimization disabled so the shared optimizer cannot fetch or cache private bytes. There is no public media endpoint or approval control in this task.

Editing or rearranging a use clears its old public display selection and review fields. SQL guards provide an additional approval-reset safeguard. If an approved photo contributes to a published item's public projection (`showPersonalPhotos=true`), editing, removing or reordering it also resets the item to PRIVATE and clears publication attribution. Private-only changes preserve the item's existing publication choice. Adding a newly unapproved photo does not change approved public output. An **Approved use** label describes the use's review flag, not a promise that the item or underlying bytes are currently publicly eligible.

Serial photos receive no automatic exception: they start private and require explicit, separate review/sanitization before any later public display. Rights revocation never prevents private photo-description editing: a changed use clears its formerly approved display pointer. Public eligibility and review remain separate from item publication as defined in [DOMAIN_MODEL.md](../architecture/DOMAIN_MODEL.md).

## Verification

Task verification uses disposable PostgreSQL and MinIO, real signed sessions, the actual image processor and private HTTP delivery. The authenticated browser runner now provisions private test storage behind a loopback TLS proxy with a temporary trusted certificate. Production's HTTPS storage requirement is unchanged; personal credentials and data are never used.

Coverage includes copy isolation, all photo classifications, viewer and revoked-session behavior, malformed/privileged fields, stale/concurrent edits, permission revalidation after waiting, approval/publication resets, retained shared assets and upload revision/idempotency. Browser journeys cover real batch uploads, image reads, editing, full-image inspection, confirmed removal, mouse/touch dragging, button ordering, camera input, unsupported files, stale tabs, access revocation and long forms at 320px in dark mode with reduced motion. Desktop/mobile screenshots are inspected. See [TESTING.md](TESTING.md) for final counts and commands.

Verified on 2026-10-13: **488 unit/component, 298 PostgreSQL, 30 asset-pipeline, 32 storage and 118 desktop/mobile browser cases pass (1,066 distinct checks)**, along with lint, types, formatting, production browser builds and whitespace validation.

Next: Task 7.1 — Search Architecture. Catalog/collection CRUD, public approval, custom media, AI enrichment and 3D interfaces are outside Task 6.3.
