# Asset upload pipeline

Task 5.3 implements private file ingestion on top of the [storage adapter](STORAGE.md) and the approved [asset architecture](../architecture/DOMAIN_MODEL.md#6-assets-uses-and-provenance). There is no upload form yet. Catalog and collection screens arrive in their assigned phases; Task 5.4 adds extensive utility coverage.

## Persistence and access

The additive [migration](../../prisma/migrations/20261004170000_asset_upload_pipeline/migration.sql) adds Asset, AssetDependency, CatalogAsset, CollectionItemMedia and AppAsset. A small follow-up [constraint migration](../../prisma/migrations/20261004170100_asset_review_boundaries/migration.sql) preserves content safety and licensing as independent reviews; revoking licensing blocks delivery without erasing the byte-content review. The database now has 35 application models, including authentication. Canonical uses have exactly one explicit target. Owned-item media and application logos use collection-scoped assets; canonical media uses catalog-scoped assets. Upload attribution is nullable and never ownership. Deleting an uploader retains files.

Upload services authorize an existing target before receiving bytes and recheck current grants inside each write transaction. Editors can upload collection media; canonical assets and application logos require their existing administrator permissions. Console custom logos and console/accessory custom models follow the approved category rules. There is no inline canonical creation, public upload or client-supplied rights approval.

Every new asset starts PENDING, rights UNKNOWN and publicSafe false. Every new use starts publicApproved false with no public display asset. Sanitization alone never approves publication. Public eligibility requires DISPLAY bytes, review and rights approval across input lineage. An original stays private even if its rights are approved. Existing global/item/field publication gates remain closed; no public media endpoint exists.

Database constraints enforce READY metadata, bounded JSON/text, one target, primary-use uniqueness, matching scope/kind, immutable identity and prepared bytes, fixed dependencies, valid lifecycle transitions and reference-aware deletion. New dependency outputs are PENDING and their inputs READY, preventing cycles. Use attachment locks the asset row and requires READY; cleanup locks the same row before claiming DELETING. Changing public use content resets approval. Rights revocation makes lineage ineligible without rewriting historic approval flags. Future public queries must apply the complete global/item/field/use/asset gate, not just the database eligibility helper.

## Limits and processing

| Input                 | Application limits                                                                                                                                                                                                                                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JPEG, PNG, WebP, AVIF | 25 MiB actual streamed bytes; 64 million pixels; at most four channels and unsigned 8/16-bit samples; a single frame. APNG markers are explicitly rejected. HEIC, GIF, HTML and SVG are not accepted by this upload route.                                                                                              |
| GLB                   | 50 MiB actual bytes; binary glTF 2; one bounded JSON chunk and optional BIN chunk; self-contained BIN resources only. External/relative/file/data URIs and required decoder extensions are rejected.                                                                                                                    |
| GLB structure         | JSON at most 1 MiB, depth 32, 100,000 traversed values, arrays at most 4,096 entries, at most 1 million aggregate accessor elements and 32 embedded PNG/JPEG images with 64 million aggregate pixels. The official Khronos validator checks glTF semantics and buffer/accessor bounds. No external resource is fetched. |
| Work                  | One admitted upload per Node process, no queue; libvips concurrency one and cache disabled; receive deadline 60 seconds, native image-operation timeout 10 seconds, upload/completion deadline 180 seconds; storage has its own bounded attempts/deadline.                                                              |

The pixel/channel/sample limits bound raw image samples to approximately 512 MB; compressed input, decoder overhead and application memory are additional. This is an ingestion resource budget, not a hard operating-system RSS limit or a future viewer performance policy. GLB validation work is bounded structurally; the request deadline does not preempt synchronous validator JavaScript. Provision memory and request limits appropriate to these budgets. A hosting provider may impose a lower body/duration limit; verify that before deployment rather than assuming these application maxima are available everywhere.

Original files remain byte-for-byte intact. Images receive separate WebP thumbnail (320-pixel longest edge) and display (1,600-pixel longest edge) assets. Each is auto-oriented, preserves aspect ratio, avoids enlargement and omits embedded metadata. The display copy is the private use's default; the original and thumbnail IDs are in its fixed upload manifest. GLB currently has only a private original, with no invented publishable model derivative or viewer.

Files are streamed into generated temporary paths in a private temporary directory, not buffered through multipart parsing. Temporary files use restrictive permissions and are removed on completion/failure. Size is counted from the body; a supplied Content-Length must also match. Actual decoding/format checks must agree with the declared MIME and filename extension. Filenames are normalized private metadata; generated object keys never include them. SHA-256 identifies bytes and never inherits another file's permissions.

Sharp 0.35.5 is a direct dependency for bounded image decoding/transforms. The official gltf-validator 2.0.0-dev.3.10 is pinned for model validation and externalized in the Node server bundle. Processing behavior follows [Sharp input safety controls](https://sharp.pixelplumbing.com/api-constructor/), [Sharp output metadata defaults](https://sharp.pixelplumbing.com/api-output/) and the [Khronos validator API](https://github.com/KhronosGroup/glTF-Validator/tree/master/npm). Runtime temporary paths are excluded from static deployment tracing at their expression; application files and packages remain traced normally.

## Private HTTP contract

All responses use `Cache-Control: private, no-store`, `Vary: Cookie` and `X-Content-Type-Options: nosniff`. Authentication is the existing real session/current grant, not an asset ID, uploader match, query token or signed URL. There are no cache-validator shortcuts around authorization.

`POST /api/uploads` receives one raw file body. Required headers:

- `Content-Type`: exact supported MIME, without extra parameters.
- `X-File-Name`: `encodeURIComponent(file.name)`; bounded, decoded basename and matching extension.
- `X-GemuKore-Target`: bounded JSON for one existing target, as below.
- `Origin`: the configured authentication origin. Cross-origin/missing-origin mutations are refused; the request Host does not define trusted origin.

Targets:

```json
{ "kind": "collection", "id": "<collection-item-uuid>", "type": "PHOTO" }
{ "kind": "catalog", "target": "consoleModel", "id": "<model-uuid>", "role": "LOGO" }
{ "kind": "application", "role": "COLLECTION_LOGO" }
```

Catalog targets: company, consolePlatform, consoleModel, game, gameRelease, accessory, accessoryVariant. Catalog roles accepted here: LOGO, COVER, SCREENSHOT, GALLERY, PREVIEW, MODEL_3D. Collection types match the approved photo/custom-logo/custom-model enum. MODEL_3D/CUSTOM_MODEL requires GLB; other accepted uses require an image. Strict schemas reject extra fields, including supplied storage keys, provenance, permissions or publication flags.

A successful 201 returns uploadId, useId and files with IDs, variants, MIME, dimensions/size and authenticated application URLs. It never returns object keys, credentials, raw provider failures, EXIF or filenames. It adds a use rather than silently replacing an existing one. A duplicate application-logo slot returns a conflict; replacement is a separate future management operation.

`POST /api/uploads/<original-id>/complete` takes no new file or target input. It uses the server's fixed manifest, checks current target permissions, streams every stored object to verify MIME/length/SHA-256, then locks and finalizes the group/lineage/use atomically. Concurrent/repeated successful completion returns the same IDs and does not duplicate uses. A prepared original's manifest and file metadata cannot be rewritten. A READY retry does not recreate a subsequently removed use.

`GET` and `HEAD /api/media/private/<asset-id>` require current private.read access and READY state before storage is contacted. Downloads stream through the application; one valid byte range is supported, including suffix ranges. Invalid/unsatisfiable ranges return 416; multipart ranges are refused. Originals use attachment disposition with a generated filename; display copies may render inline. Storage/body failures after response headers terminate the stream through the adapter's error handling. Prepared private images should use these existing derivatives with `next/image` unoptimized in future screens, rather than an unauthenticated optimizer fetch.

Generic failures use 400 invalid file/input, 401 missing session, 403 permission/origin failure, 404 unavailable file, 409 lifecycle/attachment conflict, 413 size limit, 429 busy and 503 unavailable infrastructure. An upload failure may include its private uploadId for reconciliation. No body/filename/credential is logged.

## Recovery and cleanup

Receiving/decoding errors before storage leave a FAILED original and no use. Prepared metadata and manifests are persisted before PUT; uncertain storage results or interrupted finalization stay PENDING. Completion may recover only when all expected bytes exist and match. Missing/corrupt objects never become READY. If only some artifacts exist or the reservation has no prepared manifest, retry by uploading again; do not substitute new bytes or a different target under old keys.

Storage and database operations are separate failure domains. No external I/O or image/model processing occurs inside a transaction. Marking READY, creating fixed dependency edges and creating the use are one commit; a commit failure rolls back all of them. Retryable conflict or current permission failure leaves private pending records available for explicit reconciliation after policy/target resolution.

`deleteUnusedAsset` is a server service requiring a current trusted access context, not a new route, scheduler or anonymous operator bypass. It refuses referenced assets and preserves sibling thumbnails while another derivative is used. PENDING reservations must be at least 24 hours old. It claims DELETING in a short transaction, removes the current storage object outside the transaction, and only then removes the row. A failed removal retains DELETING for a retry. Deleting a missing object/row is idempotent; an inaccessible or missing bucket is not treated as successful cleanup. Remove unused derivative leaves before their source; input foreign keys preserve provenance until every derived record is gone. Never delete a bucket or run a broad prefix sweep as application cleanup.

There is no automated reconciliation or garbage collection. An operator may inspect PENDING/FAILED/DELETING records and the private bucket, then invoke the authorized server capabilities for exact IDs. Abandoned temporary directories after a forcibly killed process require normal host temporary-directory maintenance. Future features can build a private management interface around these capabilities. Public publication, imported/enriched provenance editing, captions/reordering, video/documents, trusted SVG handling, component/template bindings and interactive viewer budgets remain their own tasks.

## Verification

Run `pnpm test:assets` with Docker. A dedicated runner provisions disposable PostgreSQL and MinIO, random credentials/ports and a private bucket, applies real migrations and destroys the fixtures afterward. No development database, bucket, account or personal uploads are used.

The suite exercises the real authenticated request boundary through processing, storage, persistence and private reads. It covers all four image formats, GLB, original retention, orientation/EXIF removal, dimensions, MIME spoofing, size/header errors, current role/origin enforcement, collection/application/canonical uses, ranges/HEAD, pending recovery and concurrent completion, missing/corrupted stored bytes, deletion retries, reference/deletion races, immutable data/lineage, public review/revocation and uploader deletion. Unit tests cover processing boundaries; desktop/mobile browser checks exercise the actual production endpoints' anonymous denial. Existing database, storage, auth and UI suites remain applicable.

Verified 2026-10-04: 154 unit/component, 25 complete asset-pipeline, 32 storage, 198 PostgreSQL and 66 desktop/mobile browser tests (475 total). Lint, typechecking, formatting, production builds and whitespace checks pass. Both additive migrations are applied locally; connectivity and schema drift checks pass. Docker regenerated the current client/dependencies, the Linux image decoder works and the existing preview/login redirect pass browser verification. The empty `gemukore-dev` bucket was explicitly created with no bucket policy, and unsigned access is denied. New installations must provision a private bucket through their storage operator; application startup never creates buckets or changes policies. Disposable databases/buckets were removed; no personal record/file was used for testing. Cloud providers and an authenticated browser upload form remain unverified/not implemented, respectively.

The dependency audit still reports the two previously reviewed high tooling advisories in deepmerge-ts and braces. Sharp and gltf-validator add no reported advisory. The existing nonfailing pg adapter deprecation remains unchanged; see [AUTH_SECURITY_REVIEW.md](../architecture/AUTH_SECURITY_REVIEW.md) for the existing audit context.
