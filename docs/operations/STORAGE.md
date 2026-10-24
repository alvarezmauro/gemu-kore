# Storage service

One server-only adapter implements the byte-storage boundary approved in [STORAGE_ARCHITECTURE.md](../architecture/STORAGE_ARCHITECTURE.md), using pinned `@aws-sdk/client-s3` 3.1146.0 and configurable S3-compatible endpoints. Development uses MinIO; the [production stack](PRODUCTION_DOCKER.md) uses Garage. Cloud-provider profiles still require account-specific compatibility tests. The [asset pipeline](ASSET_UPLOADS.md) owns content validation, lifecycle, derivatives and authorized media delivery.

## Configuration

The existing five storage variables are all-or-none. Empty values disable the integration; partial or invalid configuration fails startup with field names only. `getObjectStorage()` initializes the adapter lazily and fails safely when storage is unavailable. Credentials are never read by browser code.

| Variable                                   | Meaning                                                                                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `S3_ENDPOINT`                              | Trusted storage origin, without bucket/path/query/credentials. HTTPS is required in production. Development/test HTTP permits loopback and the Docker `minio` host only. |
| `S3_REGION`                                | Signing region. Use the provider-specific values in the architecture document.                                                                                           |
| `S3_BUCKET`                                | Private bucket assigned to this environment.                                                                                                                             |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Explicit server runtime credentials. This initial adapter uses these credentials, not an implicit AWS credential chain or session-token configuration.                   |
| `S3_FORCE_PATH_STYLE`                      | Literal `true` or `false`; defaults to `true` for existing MinIO environments. Set `false` for the documented Spaces/AWS profiles.                                       |

`.env.example` and Compose include the new addressing option; existing `.env.local` credentials were preserved. The Docker app continues to use `http://minio:9000`, while a host process uses the loopback endpoint.

Bucket provisioning is outside the application adapter. Before the first development upload, create the configured private bucket in the MinIO console. Production's `pnpm docker:prod:storage` initializes Garage's private bucket and scoped application key as described in the deployment guide; ordinary app requests do not create buckets, change ACLs or make files public. Test runners create only disposable buckets.

Use separate buckets/credentials for development, tests and production. Local MinIO root credentials remain a sandbox convenience; production requires a scoped identity with object read/write/delete rights for the application prefix. Keep anonymous bucket access disabled and deliver collection media through the application's guarded routes. The production S3 hostname is a private-object transport endpoint, not an anonymous media CDN. Provider retention/versioning policies and separate backup/inventory permissions are deployment concerns.

Development's HTTP MinIO configuration is intentionally invalid for a production server. Use production HTTPS settings for deployment; for a build-only smoke check without storage, explicitly blank the five storage fields, as the browser test runners do. Do not change `NODE_ENV` to bypass that requirement. Configuration/credential changes require restarting the application because the initialized storage client is reused.

## Contract and safety boundaries

[contracts.ts](../../src/server/storage/contracts.ts) exposes only `put`, `get`, `stat` and `remove`. [s3.ts](../../src/server/storage/s3.ts) contains all SDK imports and responses. Server-side services authorize operations and reserve immutable asset keys before using this trusted capability. The adapter does not know users, roles, publication settings, database references or asset lifecycle states.

- `put` accepts a generated locator, a factory that opens the same bytes from the beginning, exact byte count, supported declared MIME and technical metadata. It verifies byte count and SHA-256 while streaming, retaining only the last chunk until validation completes. A successful provider response alone cannot skip consumption/validation. Each retry opens a fresh source; changed bytes fail validation. The caller must provide stable validated bytes and serialize attempts/finalization for its PENDING key.
- `get` streams with backpressure. A range is an inclusive start and optional inclusive end; returned status/range/length must match. It never silently returns a full file for an ignored range. The adapter accepts only explicit start/end ranges; HTTP range validation belongs to the media handlers.
- `stat` returns normalized size/MIME/opaque ETag, or `null` for a confirmed missing key. A HEAD 404 has no error body and cannot distinguish a missing bucket from a missing key. The adapter probes with a bounded GET range and accepts only a structured `NoSuchKey` as absence. Missing buckets and denied credentials are errors; a raced object appearance requires retry instead of inventing metadata.
- `remove` deletes the current object, with absent keys treated idempotently. It does not purge historical versions, backups or retention-locked data. Reference checks and DELETING claims belong to the asset service.

All operations use a shared 60-second overall deadline, including download-body consumption. External abort signals cancel requests and destroy associated streams. Each remote command has at most three attempts with bounded jitter/backoff; the HEAD-404 probe is a separate command within the same deadline. SDK automatic retries are disabled to prevent retrying a consumed upload stream. Closing an unread download stream destroys its upstream connection. Failures after download headers propagate as normalized stream errors; HTTP handlers must terminate the response rather than append an error payload.

The provider-neutral error codes are `NOT_FOUND`, `INVALID_INPUT`, `INVALID_RANGE`, `ACCESS_DENIED`, `UNAVAILABLE` and `ABORTED`. Messages contain no upstream response text, private cancellation reason, endpoint, credential or raw cause. A timeout is unavailable; deliberate caller cancellation is aborted. Nothing logs source filenames or file bodies.

The adapter rejects unknown namespaces and malformed/unallocated keys. `createObjectLocator()` generates `assets/<asset-uuid>/<random-uuid>.<validated-extension>` under logical namespace `primary`; no user filename or content checksum becomes a key. Object metadata accepts only matching `assetId` and lowercase SHA-256. The hash is a byte-identity check, not a publication grant. ETags remain opaque and are not compared to SHA-256.

The adapter supports declared JPEG/PNG/WebP/AVIF/GLB MIME types and caps object size at 50 MiB. This is a transport boundary, **not content sniffing or model validation**. The fixtures intentionally contain synthetic bytes. The asset pipeline validates real MIME/content, image-specific limits, decoding resources and self-contained GLB before invoking storage. Database lifecycle, forms, HTTP endpoints and derivatives belong to the higher layers; there is no scheduled cleanup or signed-URL API.

Private buckets are tested directly. Application streaming uses private authorization or the separate public publication/rights gates, with no-store responses. Sharing a public collection does not change bucket ACLs or expose arbitrary object keys. See [public media/query boundaries](PUBLIC_QUERIES.md).

Production Caddy additionally limits the public storage hostname to these four
object operations beneath the configured bucket's `assets/` prefix. Bucket
controls, listing, multipart and object subresource queries are rejected before
Garage. The existing SDK's single operation `x-id` query is allowed; presigned
URLs and general S3 administration are outside this transport contract. Bucket
provisioning continues through the private Admin API. See the
[post-plan review](../architecture/POST_PLAN_SECURITY_PERFORMANCE_REVIEW.md)
for regression coverage and the vendor findings that remain open.

## Verification

Run:

```sh
pnpm test
pnpm test:storage
pnpm lint
pnpm typecheck
```

Storage tests need Docker. `vitest.storage.config.mts` builds the pinned development MinIO source and starts a uniquely named `gemukore-storage-test-…` container with generated credentials, a random loopback port and temporary in-memory data. The test bucket exists only inside that container. No development volumes or personal configuration are used. Normal completion, assertion failures and setup failures remove the container; inspect the `gemukore.test=true` label after a forcibly killed runner and remove only the exact abandoned test container.

The suite verifies private unsigned denial, exact upload/download bytes, technical metadata, ranges, empty objects, idempotent removal, missing keys/buckets, invalid credentials, oversize/length/hash violations and cancellation. Local synthetic S3 HTTP fixtures exercise transient PUT replay, changed replay bytes, early provider success, bounded retries, malformed range responses, stalled headers/bodies, truncated streams and upstream cleanup. They use the actual SDK/adapter, not mocked storage results.

Unit checks cover optional/partial/provider configurations, unsafe endpoints, boolean parsing, field-only diagnostics, keys, technical metadata and redacted errors. ESLint enforces SDK confinement and the storage/persistence/service boundaries. Storage unit files explicitly mock only the `server-only` marker; integration runners alias it only for Node test execution. Application builds retain the real browser-import protection.

Final Task 5.2 verification: 145 unit/component tests, 32 storage tests, 198 isolated PostgreSQL tests and 64 desktop/mobile browser tests pass (439 total), with lint, typechecking, formatting and production browser builds. The refreshed Docker app is healthy; its design preview and anonymous `/app` → login flow were verified in the browser. Generated-client tasks must run sequentially in this checkout: concurrently regenerating Prisma during typechecking produced a transient missing-generated-file failure; a subsequent serialized run passes.

The earlier storage-task audit reported tooling advisories in `deepmerge-ts` and `braces`. The [Task 23.2 remediation](../architecture/FINAL_REVIEW_REMEDIATION.md) records supported dependency patches and the current zero-finding workspace audit; container and Garage binary assessments remain separate and open. The known nonfailing pg adapter deprecation remains visible.

The Task 5.2 counts and adapter-only scope statements above are historical. Cloud providers have not been exercised live; before using one, run equivalent private byte/range/error/retention checks using an isolated bucket and the selected account. Garage verification and the unresolved vendor findings are recorded in the [production guide](PRODUCTION_DOCKER.md) and [final remediation](../architecture/FINAL_REVIEW_REMEDIATION.md).

## Task 5.3 handoff

The adapter is used by authenticated upload/completion, private-media and publication-gated public-media endpoints. Asset records, content validation, derivatives and explicit cleanup are described in [ASSET_UPLOADS.md](ASSET_UPLOADS.md). Public buckets, signed URL APIs, live cloud compatibility tests and scheduled automatic cleanup remain outside this implementation.
