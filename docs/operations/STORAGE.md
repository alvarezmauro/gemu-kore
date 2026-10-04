# Storage service

Task 5.2 implements the byte-storage boundary approved in [STORAGE_ARCHITECTURE.md](../architecture/STORAGE_ARCHITECTURE.md). One server-only adapter uses pinned `@aws-sdk/client-s3` 3.1146.0 with configurable S3-compatible endpoints. MinIO is verified locally; cloud-provider deployment profiles still require account-specific compatibility tests.

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

Bucket provisioning remains an operator responsibility outside application startup. Before the first actual upload, create the configured private bucket in the MinIO console or the production provider's administration interface. No application operation creates a bucket, changes ACLs or makes files public. The intended `gemukore-dev` bucket was not provisioned by this task; verification used disposable storage only.

Use separate buckets/credentials for development, tests and production. Local MinIO root credentials remain a sandbox convenience; production requires a scoped identity with object read/write/delete rights for the application prefix. Disable public access/custom-domain delivery. Provider retention/versioning policies and separate backup/inventory permissions are deployment concerns.

Development's HTTP MinIO configuration is intentionally invalid for a production server. Use production HTTPS settings for deployment; for a build-only smoke check without storage, explicitly blank the five storage fields, as the browser test runners do. Do not change `NODE_ENV` to bypass that requirement. Configuration/credential changes require restarting the application because the initialized storage client is reused.

## Contract and safety boundaries

[contracts.ts](../../src/server/storage/contracts.ts) exposes only `put`, `get`, `stat` and `remove`. [s3.ts](../../src/server/storage/s3.ts) contains all SDK imports and responses. Server-side services will authorize operations and reserve immutable asset keys before using this trusted capability. The adapter does not know users, roles, publication settings, database references or asset lifecycle states.

- `put` accepts a generated locator, a factory that opens the same bytes from the beginning, exact byte count, supported declared MIME and technical metadata. It verifies byte count and SHA-256 while streaming, retaining only the last chunk until validation completes. A successful provider response alone cannot skip consumption/validation. Each retry opens a fresh source; changed bytes fail validation. The caller must provide stable validated bytes and serialize attempts/finalization for its PENDING key.
- `get` streams with backpressure. A range is an inclusive start and optional inclusive end; returned status/range/length must match. It never silently returns a full file for an ignored range. No suffix or multipart ranges are added; an HTTP handler can resolve suffix ranges later from authorized metadata.
- `stat` returns normalized size/MIME/opaque ETag, or `null` for a confirmed missing key. A HEAD 404 has no error body and cannot distinguish a missing bucket from a missing key. The adapter probes with a bounded GET range and accepts only a structured `NoSuchKey` as absence. Missing buckets and denied credentials are errors; a raced object appearance requires retry instead of inventing metadata.
- `remove` deletes the current object, with absent keys treated idempotently. It does not purge historical versions, backups or retention-locked data. Reference checks and DELETING claims belong to the future asset service.

All operations use a shared 60-second overall deadline, including download-body consumption. External abort signals cancel requests and destroy associated streams. Each remote command has at most three attempts with bounded jitter/backoff; the HEAD-404 probe is a separate command within the same deadline. SDK automatic retries are disabled to prevent retrying a consumed upload stream. Closing an unread download stream destroys its upstream connection. Failures after download headers propagate as normalized stream errors; a future route must terminate the response rather than append an error payload.

The provider-neutral error codes are `NOT_FOUND`, `INVALID_INPUT`, `INVALID_RANGE`, `ACCESS_DENIED`, `UNAVAILABLE` and `ABORTED`. Messages contain no upstream response text, private cancellation reason, endpoint, credential or raw cause. A timeout is unavailable; deliberate caller cancellation is aborted. Nothing logs source filenames or file bodies.

The adapter rejects unknown namespaces and malformed/unallocated keys. `createObjectLocator()` generates `assets/<asset-uuid>/<random-uuid>.<validated-extension>` under logical namespace `primary`; no user filename or content checksum becomes a key. Object metadata accepts only matching `assetId` and lowercase SHA-256. The hash is a byte-identity check, not a publication grant. ETags remain opaque and are not compared to SHA-256.

The adapter supports declared JPEG/PNG/WebP/AVIF/GLB MIME types and caps object size at 50 MiB. This is a transport boundary, **not content sniffing or model validation**. The fixtures intentionally contain synthetic bytes. Task 5.3 validates real MIME/content, image-specific limits, decoding resources and self-contained GLB before invoking storage. No Asset table, upload form, media HTTP endpoint, image derivative, cleanup scheduler, signed-read API or signed-upload API was added here.

Private buckets are tested directly. Future authorized application streaming and no-store responses follow the architecture; public use approval and publication gates remain closed until their assigned implementation phases.

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

The production dependency audit still reports the two previously reviewed tooling advisories in `deepmerge-ts` and `braces`; the new SDK introduces no additional reported advisory. See [AUTH_SECURITY_REVIEW.md](../architecture/AUTH_SECURITY_REVIEW.md). The known nonfailing pg adapter deprecation is unchanged. No dependency warning is suppressed or unrelated dependency upgraded.

Next: **Task 5.3 — Asset Upload Pipeline**. Cloud providers have not been exercised live; before deployment, run equivalent private byte/range/error/retention checks using an isolated bucket and the selected production account.
