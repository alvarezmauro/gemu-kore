# Testing

Task 1.4 establishes Vitest, React Testing Library and Playwright. Tests exercise the existing foundation; collection features, authentication and storage integration will receive coverage as they are implemented.

## Setup and commands

Use the repository's Node.js and pnpm versions. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm test:e2e:install
pnpm test
pnpm test:integration
pnpm test:storage
pnpm test:assets
pnpm test:e2e
pnpm test:e2e:access
```

Unit/component tests need only Node.js. Integration tests also need a running Docker engine and its CLI. Browser tests need Playwright's Chromium download. On a Linux CI runner, use `pnpm exec playwright install --with-deps chromium` to install browser system dependencies as well.

| Command                            | Purpose                                                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `pnpm test`                        | Run unit and component tests once; no Docker or database needed.                                                  |
| `pnpm test:watch`                  | Watch unit and component tests during development.                                                                |
| `pnpm test:integration`            | Generate Prisma, provision isolated PostgreSQL, apply migrations, run integration tests and remove the container. |
| `pnpm test:storage`                | Build pinned MinIO, run isolated adapter/HTTP failure tests and remove the disposable storage container.          |
| `pnpm test:e2e`                    | Build the application, launch its production server and run desktop/mobile Chromium smoke tests.                  |
| `pnpm test:e2e:access`             | Run production private-access/signout journeys against disposable PostgreSQL and local test HTTPS.                |
| `pnpm exec playwright show-report` | Open the most recent browser test report.                                                                         |

Run lint, typechecking and formatting alongside the applicable suites:

```sh
pnpm lint
pnpm typecheck
pnpm format:check
```

## Unit and component tests

`vitest.config.mts` separates Node.js unit tests (`src/**/*.test.ts`) from jsdom component tests (`src/**/*.test.tsx`). Tests are colocated with their implementation, use explicit Vitest imports and support the application's `@/` import alias. React Testing Library provides semantic queries; the shared DOM setup adds jest-dom matchers and cleans up after every test.

The initial examples validate accepted/rejected database URLs and check the starter page's main landmark, heading and introductory text. Avoid snapshots of styling and tests that simply repeat implementation details.

Synchronous components can be rendered by React Testing Library. Exercise async Server Components through Playwright; do not change them into Client Components for the test runner. No fake production authorization or server/client bypass is added to the application.

## Task 19.1 unit coverage expansion

Task 19.1 adds 67 cases across six modules without dedicated unit suites. Assertions use established product contracts and explicit expected results; production logic, dependencies, runner configuration and timeouts are unchanged.

| Contract                           | Added coverage                                                                                                                                                                                                                                                                           | Tests                                                                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Shared copy observations           | Unknown versus known box state, leading serial zeroes, retained manual line breaks, trimmed field limits, twenty structured defects and rejected authority/repair fields.                                                                                                                | [Copy validation](../../src/features/collection/copy-validation.test.ts)                        |
| Publication review intent          | Separate personal/catalog/site/component identities, explicit approve/withdraw booleans, required review evidence and rejected actor/rights/settings injection. Tokens remain opaque here; services verify freshness and authorization separately.                                       | [Media review validation](../../src/features/public-collection/media-review-validation.test.ts) |
| Public filter links                | Remove exactly one filter, retain all other controls and Unicode query text, reset paging, preserve fixed category routes and use safe labels when public facets lack the selected option.                                                                                               | [Browse presentation](../../src/features/public-collection/browse-presentation.test.ts)         |
| Public metadata adapter            | Await request context, map only admitted canonical fields, explicitly clear social images/canonical output, retain noindex and sanitize service failures.                                                                                                                                | [Metadata adapter](../../src/features/public-collection/seo.server.test.ts)                     |
| Enrichment value/freshness helpers | Object-key order independence, meaningful array/scalar changes, serialized UTF-8 byte limits and safe domain/permission/error propagation.                                                                                                                                               | [Enrichment helpers](../../src/server/services/enrichment/common.test.ts)                       |
| Enrichment proposal preparation    | Preserve manual input, append aliases/references/developers without loss or duplicates, omit no-ops, retain scope and source evidence, refuse unsupported/missing evidence or unchosen trailers, and replace a whole playtime estimate set without filling unknown values from old data. | [Proposal preparation](../../src/server/services/enrichment/proposals.test.ts)                  |

The existing explicit ADMIN/EDITOR/VIEWER permission matrix and fresh-login boundaries continue to run in the full suite. The enrichment cases use a synthetic normalized fixture validated against the neutral metadata contract; database construction is replaced with a throwing test stub. Metadata adapter tests mock the public service and Next.js request-context entry point, so they verify output mapping rather than claim database authorization or framework rendering coverage. No database, object storage, live provider, development server or browser is started by these cases. Existing integration/browser evidence remains separate; their expansion belongs to Tasks 19.2–19.4.

Run the focused additions or the entire suite:

```sh
pnpm exec vitest run src/features/collection/copy-validation.test.ts src/features/public-collection/media-review-validation.test.ts src/features/public-collection/browse-presentation.test.ts src/features/public-collection/seo.server.test.ts src/server/services/enrichment/common.test.ts src/server/services/enrichment/proposals.test.ts --maxWorkers=1
pnpm exec vitest run --maxWorkers=1
```

## Database integration tests

`vitest.integration.config.mts` includes only `tests/integration/**/*.test.ts`. Its global setup starts a uniquely named PostgreSQL container using the same pinned image as development. Each run uses:

- An independently generated password and database URL, overriding any inherited `DATABASE_URL`.
- A random loopback-only host port.
- Temporary in-memory database storage, with no development volumes mounted.
- The committed Prisma migrations before tests begin.

The example checks the actual application database health function and transaction helper. A test-only probe table verifies both committed writes and rollback on failure. It is not a domain model and requires no application migration. The database pool is disconnected afterward. Integration files run serially against that run's database; future tests must clean up their own fixtures.

Only the Node integration runners map `server-only` to an empty test helper so server modules can run outside Next.js. The unit/component runner keeps the real module by default; individual server-helper unit files explicitly mock its marker locally and replace external boundaries as needed. Application builds retain the real server-only protection.

Normal completion, failed assertions and setup failures after container creation remove the test container. A forcibly killed runner or stopped Docker engine can prevent cleanup. Inspect `docker ps -a --filter label=gemukore.test=true` and remove only the abandoned `gemukore-test-…` container by its exact name. Never reset the development database to run tests.

## Browser tests

`playwright.config.ts` starts a fresh production build at `http://127.0.0.1:3100`, runs `tests/e2e/`, and stops that server afterward. It refuses to reuse an existing server, so an occupied port fails instead of silently testing another app. The build uses the normal `.next` production output; do not run another production build/start against the same checkout concurrently. The Docker development app uses its own build volume.

Desktop and mobile Chromium share the same downloaded browser. This is an initial smoke suite, not cross-browser certification. It checks the rendered starter page, browser errors and the public health response's exact fields and cache policy. Future authenticated journeys and writes need dedicated test identities/data when those features exist.

The current browser suite supplies a syntactically valid but unavailable test database URL. These read-only starter/health checks require no database and cannot connect to the personal development database. No secrets or private data are placed in fixtures.

Task 3.2 adds real auth callback/session integration tests against the disposable database, with Google/GitHub HTTP responses mocked only in tests. Auth browser checks explicitly blank provider credentials and verify the unavailable setup, anonymous redirects and generic error/denial screens. They do not use the personal OAuth configuration. See [AUTHENTICATION.md](AUTHENTICATION.md) for the live-provider verification boundary and setup.

HTML reports, screenshots and failure traces go into ignored `playwright-report/` and `test-results/` directories. CI rejects accidentally focused tests, uses one worker and retries failures twice; local runs do not retry. No CI deployment pipeline is introduced by this task.

## AccessGrant browser journeys

Task 3.3 adds `pnpm test:e2e:access`. It requires Docker, Chromium and OpenSSL (available on the current macOS development host). The runner shares the isolated PostgreSQL provisioning helper, creates a temporary one-day self-signed certificate outside the repository, and forwards loopback-only `https://127.0.0.1:3111` to a fresh production Next.js server on port 3110. Playwright accepts only this test certificate. Normal application Secure cookie behavior is preserved; no application TLS or auth bypass is introduced for testing.

The runner supplies a generated test-only auth secret and explicit dummy provider configuration, overriding personal configuration. Fixtures run as short-lived server-side commands, create verified Users and real database sessions, sign their fixture session cookie, and modify grants only in that run's test database. The browser and production auth library still validate the cookie/session and current grant. These fixtures test local authorization, not live provider verification; separate integration tests exercise the real OAuth callbacks with intercepted provider responses.

Desktop/mobile checks cover all three enabled roles, absent grants with forged role/email headers, role change/disable/re-enable/delete on the same session, private response cache policy and signout through the real auth route. Task 3.5 adds initially disabled access, unverified identity, expired/revoked sessions, tampered cookies and separate admin/viewer/ungranted browsers. Tests run with one worker and reset only disposable fixtures. The config and fixture commands reject execution without the isolated database/origin markers. Never use these fixture helpers against development data.

Run this suite and `pnpm test:e2e` sequentially: both use the checkout's production build output and the same report directory. Normal completion, failed assertions and setup errors clean up the test proxy, temporary certificate and database container. As with integration tests, forcibly killing the runner may leave an abandoned test container; inspect the test label and remove only that exact container. Ports 3110, 3111 and (from Task 6.3) 3112 must be free. See [ACCESS_GRANTS.md](ACCESS_GRANTS.md) for authorization and operator procedures.

## Task 5.2 storage checks

`pnpm test:storage` uses `vitest.storage.config.mts` and `tests/storage/`. Global setup builds the same pinned MinIO source as development and starts a uniquely named `gemukore-storage-test-…` container with generated credentials, a random loopback port and temporary in-memory data. No personal bucket, configuration or data volume is used. Completion/assertion/setup failures remove the container; after a forcibly killed runner, inspect the `gemukore.test=true` label and remove only the exact abandoned container.

The 32 checks exercise real private MinIO byte/metadata/range/delete operations and the actual SDK against synthetic HTTP failures. They cover missing bucket/key ambiguity, unsigned denial, incorrect credentials, actual/declared length and hash mismatch, replay safety, bounded retries, cancellation, deadlines through body consumption, malformed ranges, truncated responses and abandoned-stream cleanup. Fixtures deliberately use synthetic bytes because content sniffing/decoding belongs to Task 5.3. Configuration/helper/boundary unit checks bring the unit/component total to 145.

The general browser runner explicitly blanks the five storage fields so its production smoke build does not inherit development credentials. From Task 6.3, the authenticated runner supplies independent disposable MinIO credentials through a test-only HTTPS proxy; it never inherits personal storage credentials. Run Prisma-generating checks, typechecking and browser builds sequentially in a checkout: concurrent regeneration can transiently remove generated files while another check reads them. Final Task 5.2 totals are 145 unit/component + 32 storage + 198 database integration + 64 desktop/mobile browser checks = 439 passing tests. See [STORAGE.md](STORAGE.md) for configuration and limits. Live cloud-provider compatibility is not claimed.

## Role authorization tests

Task 3.4 adds pure permission/fresh-login unit tests and direct server authorization tests in `tests/integration/permissions.test.ts`. The integration suite uses real signed sessions and current grants, including role demotion, expired/revoked/unverified identities, strict grant-service inputs, last-admin safeguards and competing grant changes. A test-only table in disposable PostgreSQL demonstrates transaction rollback when an editor's copy-management operation attempts an inline canonical write. It is not a domain model or migration and is removed afterward. No future catalog/collection functionality is claimed by this probe.

## Task 3.5 authentication regression coverage

This task expands tests and test-only fixtures without changing production auth architecture, provider configuration, dependencies or migrations. The five required areas are covered across independent boundaries:

| Area               | Added regression checks                                                                                                                                                                                                     | Layer                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Authorized email   | A grant provisioned before the first Google/GitHub login matches the verified normalized identity for ADMIN, EDITOR and VIEWER; private DTO and copy/catalog permissions agree with the current role.                       | Real OAuth callback plus PostgreSQL/services |
| Unauthorized email | Another person's grant does not authorize a valid OAuth session; plus aliases and dot variations are distinct, even with forged email/role headers. Separate browsers retain their own grant/role.                          | Callback/services and desktop/mobile browser |
| Disabled access    | A grant disabled before login stays disabled; OAuth cannot change it. Disabled users can still sign out. Revocation affects both established OAuth sessions and re-enabling restores the current role.                      | Callback/services and desktop/mobile browser |
| Different roles    | Provider-authenticated admins/editors/viewers receive their exact grant role and copy/catalog restrictions. One browser's admin permission never changes another viewer's rendered role or authorizes an ungranted browser. | Callback/services and desktop/mobile browser |
| Normalization      | Case/space normalization matches a pre-existing grant for both providers; repeated normalization is idempotent; plus/dot distinctions and malformed/control-character input remain rejected.                                | Unit and callback/services                   |

Additional browser checks reject an unverified User even with an enabled admin grant, reject a modified signed session cookie and redirect an already authorized browser after database session expiry or deletion. They exercise the existing production routes and Secure cookie validation, not test-only application endpoints. Test-only browser fixtures now accept separate synthetic identities and deliberately disabled/unverified states; fixture helpers remain under `tests/` and are restricted to the disposable database/origin.

Provider HTTP responses remain intercepted only inside integration tests. Callback/session validation, normalized identity ingestion, Prisma persistence and application grants/permissions use the actual production code. Multi-session cases establish the provider binding first, then create a returning session and retain both cookies to check current policy. Browser fixtures start at a signed database session and do not simulate provider consent. Live Google/GitHub login still needs actual OAuth app configuration and credentials; this task does not claim that verification or a completed domain CRUD flow.

Verified on 2026-10-04: 82 unit/component tests, 130 isolated PostgreSQL integration tests and 64 desktop/mobile Chromium tests (38 existing checks plus 26 access journeys) pass, 276 total. Task 3.5 adds 44 cases to the prior 232. Lint, TypeScript, formatting, diff whitespace checks and production build pass. Temporary PostgreSQL containers were removed after the integration/browser runs. No personal development database, OAuth credentials or collection records were used.

## Task 3.6 security verification

The [authentication security review](../architecture/AUTH_SECURITY_REVIEW.md) records the source/route inventory, trust boundaries, findings and unresolved operational/dependency risks. Seven added integration regressions reproduce pre-fix behavior and verify:

- Authenticated browser attempts to update/revoke sessions through four unused endpoints return 404 without changing the session or any grant.
- Google/GitHub provider-error callbacks preserve genuine library state/cookie checks but return only a generic configured-origin login redirect, no-referrer and private no-store headers, without creating a session.
- The SDK error endpoint cannot forward arbitrary provider error descriptions/codes into the login URL.

Verified on 2026-10-04: 82 unit/component tests, 137 isolated PostgreSQL integration tests and 64 desktop/mobile Chromium tests pass (38 public/unconfigured checks plus 26 access journeys), 283 total. Lint, TypeScript, formatting, diff whitespace and the production builds used by both browser suites pass. Typechecking was rerun successfully after an initial concurrent browser build replaced generated route types; builds and type generation must run sequentially against the same `.next` directory. All temporary database containers were removed. The refreshed Docker app renders login/design preview without browser errors or an error overlay, and anonymous `/app` redirects to login. Its unconfigured auth response also preserves generic 503, no-store and no-referrer behavior.

Both full and production dependency audits report two high upstream tooling advisories after the mysql2 update removes one high and one moderate advisory. Audit output is not suppressed or counted as a passing security gate. Reachability and follow-up are recorded in the review. The optional patched MySQL version was verified in both host and Docker dependency trees; `optimisticRepeatInstall: false` ensures repeated frozen installs check override/lockfile updates even when `package.json` is unchanged. Live provider consent and production ingress/rate-limit behavior remain outside these local checks.

## Task 4.3 repository verification

Eighteen new unit cases run the actual ESLint configuration to check server-only repository markers, repository/service/UI dependency direction and service-owned transactions. Nine new isolated PostgreSQL cases test the new catalog/collection identity reads and existing access persistence: missing/wrong-kind IDs, narrow selected records, each owned subtype, archived parent/product references, supplied-transaction visibility and commit/rollback. Fixtures contain synthetic private notes, serials and evidence to verify those fields do not enter identity results. These are private persistence records, not public DTOs or an implemented public-eligibility query.

Verified on 2026-10-04: **100 unit/component, 198 isolated integration and 64 desktop/mobile Chromium tests pass, 362 total**. Lint, TypeScript, formatting, production builds and whitespace checks pass. The existing local login and design preview load without browser errors or overlays; anonymous `/app` redirects to `/login`. The dedicated verification browser was closed and all disposable test databases were removed. No schema, migration, package, environment, endpoint or UI change is required.

A focused integration trace located a nonfailing pg 8.23.1 deprecation warning in Prisma's PgTransaction nested-relation dispatch. It is recorded in [REPOSITORIES.md](REPOSITORIES.md), not suppressed; current transaction visibility/rollback tests pass, and driver/adapter compatibility must be checked before a future pg 9 upgrade. Existing dependency advisories and live OAuth limitations are unchanged. Full domain CRUD, storage, public projection and publication behavior are outside Task 4.3. Next: Task 5.1 — Storage Architecture.

## Task 4.2 schema review verification

The core suite now contains 52 database cases. Twelve new cases cover both root-ID orphan bypasses across the three subtypes, required flat/nonnullable scalar lists on four tables, complete leading-prefix foreign-key index coverage and all eight chronological history indexes. Before the corrections, 11 new cases failed as expected; the FK audit already passed. All cases pass after the additive review migration, while existing copy deletion, subtype replacement, credit scope, dates, targets, provenance and private defaults continue to pass.

Verified on 2026-10-04: 82 unit/component tests, 189 isolated database integration tests and 64 desktop/mobile Chromium tests pass, **335 total**. Lint, TypeScript, formatting, schema validation, production builds and diff whitespace pass. Fresh migration replay, repeated deployment and Prisma-visible drift pass in the disposable database. The new migration is applied to development PostgreSQL, with current migration status, no detected drift and healthy connectivity. Docker's refreshed client exports all 30 models; login and design preview load without browser errors or overlays, and anonymous private entry redirects to login. The dedicated verification browser was closed and all disposable test containers were removed. No personal collection fixtures, live provider credentials or new dependency were introduced.

Findings, migration validation/recovery boundaries and staged service responsibilities: [PRISMA_SCHEMA_REVIEW.md](../architecture/PRISMA_SCHEMA_REVIEW.md). Next: Task 4.3. Existing dependency advisories and live OAuth/deployment limitations from Task 3.6 are unchanged by this schema review.

## Task 4.1 core schema verification

`tests/integration/core-schema.test.ts` adds 40 database cases using the existing disposable PostgreSQL runner. They exercise real Prisma nested/transactional aggregate creation and direct SQL constraint failures. Coverage includes all three matching owned subtypes, orphan commit failure, wrong/fixed types, subtype movement/deletion/replacement, catalog-preserving copy deletion, duplicate printings/copies, shared-reference deletion rules, explicit markets/variant compatibility, scoped credits, valid/invalid partial calendar dates, typed reference targets and uniqueness, locations/defects, private settings defaults, immutable metadata facts, deleted-user attribution and versioned technical JSON.

The runner replays the complete migration chain on a fresh database, then the core suite redeploys it to confirm no pending migration and compares the live schema to Prisma with a nonzero exit on drift. Custom SQL constraint behavior is tested separately because a Prisma-visible diff cannot prove CHECK/trigger correctness. Fixture cleanup intentionally truncates only disposable core data, including immutable test history; settings remain intact. Never use that fixture reset on a personal database.

Verified on 2026-10-04: 82 unit/component tests, 177 isolated integration tests and 64 desktop/mobile Chromium tests pass, **323 total**. Lint, TypeScript, formatting, schema validation, production builds and diff whitespace pass. The core migration is applied to development PostgreSQL; migration status and a read-only drift check are clean, and connectivity is healthy. The restarted Docker app generated all 30 models and renders login/design preview without browser errors or an error overlay; anonymous private entry still redirects to login. All disposable test containers were removed. No real collection records or provider credentials were used for tests. The two dependency advisories recorded in Task 3.6 are unaffected by this schema-only task.

Implementation contracts and remaining service responsibilities are in [CORE_DATABASE.md](CORE_DATABASE.md). The subsequent Task 4.2 review is recorded above; these checks do not claim completed domain CRUD, publication, location hierarchy services or media/enrichment functionality.

## Task 1.4 verification

Verified on 2026-10-03:

- Nine unit/component tests, three database integration tests and four desktop/mobile browser checks pass.
- Lint, TypeScript, formatting and the production build pass.
- An intentional temporary failing test returns a failure status and still removes its database container; the temporary test was removed after verification.
- Playwright stops its production server afterward. The existing local and Docker development previews remain available.
- No domain schema changes or migrations were needed.

## References

The setup follows the official [Next.js Vitest guide](https://nextjs.org/docs/app/guides/testing/vitest), [Vitest global setup](https://vitest.dev/config/globalsetup), [React Testing Library setup](https://testing-library.com/docs/react-testing-library/setup/) and [Playwright web server guidance](https://playwright.dev/docs/test-webserver).

## Asset pipeline integration

Task 5.3 adds `pnpm test:assets`, using `vitest.assets.config.mts` with both isolated PostgreSQL and MinIO setup. It exercises real file processing, authenticated request handlers, private storage, lifecycle/use constraints, pending recovery and cleanup. It never inherits personal storage credentials. Browser smoke checks now also test anonymous upload/completion/GET/HEAD denial on desktop and mobile. See [ASSET_UPLOADS.md](ASSET_UPLOADS.md) for the contract and coverage. Task 5.4 extends that utility coverage below.

Task 5.4 adds 240 unit utility cases and four authenticated upload regressions. Current totals are 394 unit/component, 29 full asset-pipeline, 32 storage, 198 PostgreSQL and 66 desktop/mobile browser cases (719 overall). New unit coverage lives in the asset description/contracts/content/image-metadata tests and storage asset-utilities tests. Tests use temporary generated image/model bytes and valid PNG chunks, with no network download or external-provider dependency. No general coverage tool, snapshot of encoder bytes or extra package is added. The existing pg adapter deprecation remains nonfailing and documented; no warning is suppressed.

## Task 6.1 location verification

Task 6.1 adds 22 unit/component, 28 database integration and 16 desktop/mobile browser cases for private hierarchical locations. Verified on 2026-10-04: **416 unit/component, 226 PostgreSQL integration and 82 browser cases pass (724 checks)**, with lint, typechecking, formatting, production browser builds and whitespace checks. The 29 asset-pipeline and 32 storage cases are unchanged and retain their Task 5.4 verification; they were not rerun for this task.

The authenticated browser runner covers actual location forms and Server Actions using real signed sessions in its disposable PostgreSQL database. Its fixture CLI adds guarded location reset/seed/count commands; these require the isolated runner's database URL and loopback TLS auth URL. No session bypass, temporary application endpoint or personal-data fixture is introduced. Both browser projects exercise hierarchical CRUD, moving/reordering, breadcrumb updates, duplicate and stale errors with retained input, grant demotion while a form is open, viewer/private boundaries, confirmation focus and a 320px dark/reduced-motion long-name layout. General browser checks additionally verify anonymous location access redirects to sign-in. Unit/component tests caught and prevented a dialog-child remount that cleared form values during saving.

Database cases cover concurrent cross-moves, duplicate creation, SQL casing for non-ASCII names, occupied-location deletion, owned-item attachment retention, stale tokens, atomic rollback, ordering gaps/ties and failure on corrupted direct-SQL hierarchy. Every test database is removed after its runner completes. See [LOCATIONS.md](LOCATIONS.md) for behavior, transaction contracts and boundaries. Next: Task 6.2 — Defects.

## Task 6.2 defect verification

Verified on 2026-10-05: **439 unit/component, 267 PostgreSQL integration and 98 desktop/mobile browser cases pass (804 checks)**, with lint, typechecking, formatting, production browser builds and whitespace validation. Task 6.2 adds 23 unit/component, 41 integration and 16 browser cases. The asset-pipeline and storage suites remain unchanged with their earlier verification and are not included in this task’s rerun total.

The new defect suites cover all severities and owned types, independent copies of a canonical release, scoped update/delete IDs, repair-date and note handling, active/accepted/unresolved semantics, strict input and narrow DTOs, roles and revoked identities, concurrent/stale aggregate writes, row-lock waiting with grant demotion, atomic rollback, publication approval resets and cascade behavior. Browser journeys use the existing isolated database, real signed sessions and loopback TLS, with no authentication bypass or development fixtures. Both browser projects check empty states, structured CRUD, copy selection, repair details, confirmation focus, retained stale/permission errors, private boundaries and long-content dark/reduced-motion layouts at 320px. Desktop and mobile screenshots were inspected.

The guarded browser fixture CLI adds disposable copy seed/reset/count commands; no catalog or collection seed is added to development. All disposable test databases are removed after their runner completes. See [DEFECTS.md](DEFECTS.md) for service and UI contracts. Next: Task 6.3 — Collection Media.

## Task 6.3 collection photo verification

Verified on 2026-10-13: **488 unit/component, 298 PostgreSQL integration, 30 asset-pipeline, 32 storage and 118 desktop/mobile browser cases pass (1,066 distinct checks)**. Lint, typechecking, formatting, production browser builds and whitespace validation pass. Task 6.3 adds 49 unit/component cases, 31 database cases, one real asset-pipeline regression and 20 browser cases. Browser coverage comprises the 44 general cases and 74 authenticated cases; unchanged access/location/defect journeys passed in the full run, then the final 20 photo cases passed after the last UI refinements.

The authenticated runner now provisions independent disposable PostgreSQL and MinIO fixtures. A temporary certificate with a loopback SAN is trusted only by the spawned test processes through `NODE_EXTRA_CA_CERTS`; the test-only storage TLS proxy uses port 3112. Production storage still requires HTTPS. The runner creates its private test bucket using generated credentials, forwards storage traffic to the random loopback MinIO port, and removes both containers, proxies and certificate directory on completion. Test byte objects never enter personal buckets. Physical device camera hardware is not claimed: the real camera-input attribute, picker upload and server/storage flow are verified in Chromium.

To rerun only the photo browser journeys while retaining isolated storage, authentication and production configuration:

```sh
pnpm test:e2e:access tests/access-e2e/media.spec.ts
```

The UI/transport cases cover strict classification/description bounds, move semantics, actual versus indeterminate transfer progress, processing versus saved states, sequential batches, uncertain responses, explicit recovery, retained fields/opening revision, confirmation, pending-save protection and viewers. PostgreSQL checks cover all owned types and classifications, exact reorder sets, foreign/custom-role IDs, shared-asset retention, narrow DTOs, stale/concurrent changes, unchanged revisions, lock-wait permission revalidation, revoked sessions and approval/publication resets including revoked asset rights. The real asset regression verifies append order, thumbnail lineage, root revision/actor, idempotent completion and retained bytes after detachment.

Desktop and mobile browser journeys exercise actual image uploads and authenticated GETs, classification/caption/alt text, full-image inspection, confirmation and focus after removal, batch order, copy isolation, mouse/touch dragging, button order, camera input, unsupported/unreadable images, stale tabs, viewer access and revoked delivery. The 320px dark/reduced-motion case checks long captions and edit forms without horizontal overflow. Desktop/mobile gallery and dark screenshots were inspected. The preexisting nonfailing pg adapter deprecation remains unchanged; no warnings are suppressed. Details: [COLLECTION_MEDIA.md](COLLECTION_MEDIA.md). Next: Task 7.1 — Search Architecture.

## Task 7.2 search verification

Verified on 2026-10-13: **516 unit/component, 346 PostgreSQL integration and 134 desktop/mobile browser cases pass (996 distinct checks)**, plus lint, TypeScript, formatting, production browser builds and whitespace validation. Task 7.2 adds 28 unit/component, 48 integration and 16 browser cases. Browser coverage comprises 44 general cases and 90 authenticated cases: the unchanged 74 authenticated journeys passed in the full run, then the final 16 search cases passed after the query/UI refinements. Asset-pipeline and storage suites retain their earlier verification and are not included in this task's rerun total.

Search uses actual PostgreSQL full-text/trigram expressions, normalized catalog relationships and services with real signed sessions. Cases cover all owned categories, independent copies, companies/credits/markets, aliases and Unicode normalization, literal codes and wildcard escaping, notes/defects/repairs, exact/prefix/typo relevance, identity versus related-company ordering, cross-field AND, repeated terms, archived/incomplete identities, committed renaming/reidentification, deterministic paging, strict input and narrow DTOs. Transport cases exercise same-origin/auth checks, malformed/oversized JSON, private cache headers and redacted failures. Current permissions are checked for every read role, idle requests and revocation. Reserved public SQL excludes hidden data before matching/ranking and observes global/per-copy publication gates; no public endpoint is introduced.

The complete-query plan test adds 3,000 synthetic owned games to the four-copy fixture, analyzes the live tables and runs service searches plus `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` for selective names, typos, multi-source matching, common words and short prefixes. Selective canonical queries use the search GIN indexes without forced planner settings; all five searches fit the two-second statement timeout. Request-local CTEs avoid repeated joins, and display context is loaded only for the final bounded page. These checks measure an isolated hobby-scale corpus, not a production latency/concurrency guarantee. Existing core cases verify fresh migration replay, idempotent deployment, Prisma-visible drift and preserved integrity constraints.

The search browser cases run the production page/API against disposable PostgreSQL and real sessions on desktop/mobile Chromium. They cover all categories, identical copies, live renaming, existing exact-copy photo/defect links, private POST bodies without query-string/storage persistence, revoked access, retained validation errors, cleared obsolete results, idle/empty states and keyboard use at 320px in dark mode with reduced motion. Desktop/mobile and dark screenshots were inspected. Component tests additionally check cancellation/stale-response rejection, retry behavior, associated field errors and incomplete identity. Tests add no fixtures to development; every disposable database/storage container is removed after completion.

To rerun only the search journeys:

```sh
pnpm test:integration tests/integration/search.test.ts
pnpm test:e2e:access tests/access-e2e/search.spec.ts
```

The additive search migration is also applied to the existing local GemuKore database after explicitly verifying its loopback address, port, database and schema. Migration status and authenticated connectivity pass. The existing Docker PostgreSQL/MinIO/app services are healthy on port 3002; `/api/health` returns 200, anonymous `/app/search` redirects to `/login`, and anonymous private POST returns 401 with private no-store headers. The local sign-in page renders without browser errors and retains its existing unconfigured-provider state. Authenticated feature behavior is verified in the disposable runner; live provider consent/credentials are not claimed. The known nonfailing pg adapter warning remains unchanged. See [SEARCH.md](SEARCH.md). Next: Task 7.3 — Command Palette.

## Task 7.3 command palette verification

Verified on 2026-10-15: **527 unit/component, 361 PostgreSQL integration and 152 desktop/mobile browser cases pass (1,040 distinct checks)**. Lint, TypeScript, formatting, production browser builds, internal documentation links and whitespace validation pass. Task 7.3 adds 11 unit/component, 15 integration and 18 browser cases. Browser coverage comprises 44 general cases and 108 authenticated cases: the existing 90 authenticated journeys passed in the full run, then the final 18 palette cases passed after assertion corrections and copy refinements. Asset-pipeline/storage suites retain their earlier verification and are not included in this rerun total.

The component tests run actual shadcn Command/cmdk and Radix Dialog primitives with mocked search transport/navigation. They cover both opening/toggling shortcuts, initial focus and restoration, Escape, keyboard actions, separation of canonical and physical-copy selection, private input reset, cancellation/late responses, correction/retry and ignored modified/repeated/composing shortcuts or other open modals. Narrow input/result schemas reject untyped IDs, excessive catalog results, privileged scope fields and extra private properties. Existing full-page search tests also verify the shared request hook. No new production test bypass is introduced.

PostgreSQL cases execute all eight catalog types, all read roles and the actual private endpoint with real sessions. They verify unowned canonical records remain outside collection hits, archived identities remain searchable only through owned references, committed edits are immediately visible, catalog results deduplicate with stable typed IDs, bounds/flags are deterministic and serial/note/defect/repair text cannot enter the catalog projection. Strict POST/origin/body checks, revocation and redacted failures use the common transport. The existing 3,004-copy plan case additionally runs the palette service and real catalog EXPLAIN statements for selective names/typos, multi-source terms, common words and prefixes; selective catalog matching uses the existing GIN indexes without forced scans and remains inside the statement timeout. No schema/index migration is added.

Desktop/mobile production journeys verify both shortcuts on all five private pages, visible triggers, grouping/identical copies, canonical previews, actual copy-specific photo/defect routes, arrow/Enter selection, focus traps/restoration, outside dismissal, private terms in POST bodies, reset on close/reload, validation/empty/retry states, access revocation/re-enable, an existing form dialog, public/denied boundaries and long results at 320px in dark mode with reduced motion. Screenshots were inspected. The unchanged authentication, locations, defects, photos and full-page search cases also pass. The runner removes its disposable PostgreSQL and MinIO containers; personal records and credentials are not used.

To rerun just the palette browser journeys:

```sh
pnpm test:e2e:access tests/access-e2e/palette.spec.ts
```

`cmdk` 1.1.1 is pinned as the only new dependency, with lockfile integrity and the existing compatible Radix/React packages. The local app initially needed a dependency refresh after its source mount changed; restarting the existing container completed its frozen install and restored healthy `/api/health` 200 behavior on port 3002. Anonymous `/app/search` still redirects to `/login`, and anonymous `POST /api/search/palette` returns 401 with private no-store headers. Existing local OAuth provider configuration is unchanged; live consent is not claimed. The known nonfailing pg adapter deprecation remains unchanged. Details: [COMMAND_PALETTE.md](COMMAND_PALETTE.md). Next: Task 7.4 — Filters and Sorting.

## Task 7.4 filters and sorting verification

Verified on 2026-10-15: **558 unit/component, 393 PostgreSQL integration and 168 desktop/mobile browser cases pass (1,119 distinct checks)**. Lint, TypeScript, formatting, production browser builds, internal documentation links and whitespace checks pass. Task 7.4 adds 31 unit/component, 32 PostgreSQL and 16 browser cases. Browser coverage comprises 44 general cases and 124 authenticated cases: the existing authenticated journeys passed across the full run and a final focused search/filter rerun after updating keyboard expectations for the added controls and correcting ambiguous test selectors. Asset-pipeline/storage suites retain earlier verification and are not included in this rerun total.

Unit/component cases verify strict URL serialization/validation, unknown and duplicate keys, malformed values, supported sort enums, private POST bodies, restored controls, unavailable selections and cancellation/late-response rejection across filter scopes. The shared request hook also retains all existing collection/palette tests. Invalid controls never produce a broad collection request; a stale but valid option remains selected until removed.

Actual PostgreSQL service/query cases verify all supported filters across owned consoles, games and accessories; box false versus unknown; unresolved versus repaired defects; model manufacturer versus platform brand; explicit accessory family/variant producers; scoped release publisher credits; selected-market year correlation and unknowns; no guessed date/year inheritance; edition; hierarchy/descendant/unassigned locations; owned-reachable narrow option labels; deterministic sorts, UUID ties, unknowns last and filtering before bounded paging. Separate physical copies remain separate. Real sessions cover all three read roles, origin/body validation, strict privileged-field rejection and revocation. Existing reserved public-query privacy tests still pass without a new public filter service.

The 3,004-copy search plan fixture additionally executes the filtered service and complete filtered SQL plans for selective exact/typo terms, cross-source matching, a common word and a short prefix. They complete within the existing two-second statement timeout using the existing schema/indexes. This is a disposable hobby-scale plan regression, not a production throughput guarantee. No schema migration or external search dependency is added.

Desktop/mobile browser journeys exercise bookmarks, reload, Back/Forward, filter removal/clear/browse, regional publisher/year combinations, model/producer filters, box and defect states, copy ordering, nested locations, private free text retained across control changes but absent from URLs, invalid/duplicate controls, unavailable selections, grant revocation and access-denied reload. Keyboard focus and the command palette coexist with controls at 320px in dark mode and reduced motion, with long titles and no horizontal overflow. Screenshots were inspected. The production runner uses disposable PostgreSQL/MinIO and actual signed test sessions; it never writes collection fixtures to development.

To rerun the filter cases:

```sh
pnpm test:integration tests/integration/search.test.ts
pnpm test:e2e:access tests/access-e2e/filters.spec.ts
```

Ratings remain deferred to their approved Phase 11 fields; unsupported rating filters are rejected. Grid/list/pagination UI and persistent view preferences remain Task 7.5. The existing local Docker application requires no dependency refresh or migration for this task. Local `/api/health` returns 200 and anonymous `POST /api/search/filtered` returns 401 with private no-store headers; existing OAuth provider configuration remains unchanged. Authenticated behavior is verified in the disposable production runner. See [FILTERS_AND_SORTING.md](FILTERS_AND_SORTING.md) for contracts and semantics. Next: Task 7.5 — Grid/List Views.

## Task 7.5 collection views verification

Verified on 2026-10-15: **583 unit/component, 400 PostgreSQL integration and 188 desktop/mobile browser cases pass (1,171 distinct checks)**. Lint, TypeScript, formatting, production browser builds, internal documentation links and whitespace checks pass. Task 7.5 adds 25 unit/component, seven PostgreSQL and 20 browser cases. Browser coverage comprises 44 general and 144 authenticated cases: the full authenticated run passed except for the two palette tests expecting the previous destination order, then the final 38 collection/palette cases passed after correcting those expectations and refining compact photo fallbacks and pagination focus. Asset-pipeline/storage suites retain earlier verification and are not included in this task's rerun total.

Unit/component cases cover strict bookmark/page validation and offset bounds, URL/private-text separation, collection-home browsing, page resets, missing observations, duplicate physical copies and exact-copy actions in both layouts, broken-image fallback, local preference restoration, malformed values, same-page/cross-tab storage notification and blocked storage. Switching layouts leaves query membership/order and pagination unchanged and does not issue another collection POST. Existing search/palette cancellation and late-response checks remain passing.

Real PostgreSQL service/transport cases verify empty collection browsing separately from search idle behavior, metadata per owned subtype/copy, 45 copies of one release split into 20/20/5 results with stable UUID ties and no duplicates, final/empty pages and bounded offsets. Card queries prefer ready primary private photos and their actual thumbnail lineage, fall back to ready display images or the next eligible use, exclude originals and serial classifications, and do not return storage keys, original filenames, notes or serial text. All three read roles, strict inputs/origins, anonymous access and revoked grants use actual signed sessions and current server policy. The existing 3,004-copy search corpus additionally runs collection reads with card hydration.

A complete-query diagnostic identified intermittent empty-text browse timeouts caused by JIT: 891 compiled functions consumed about 2,142 ms of a 2,145 ms read. Search configuration now sets `jit=off` only inside its transaction, retaining the two-second statement timeout and existing indexes. A regression forces the cost threshold low, executes the actual filtered SQL plan without JIT and verifies that pooled settings are restored. No global PostgreSQL setting is changed, and no timeout was increased to make checks pass. Temporary diagnostic logging was removed.

Production browser journeys exercise `/app/collection` through the entry page and palette; responsive grid/list layouts; locally saved preference and blocked storage; page navigation, result focus, bookmarks, reload and Back; filter/sort/private-text page resets; invalid and valid-empty URLs; revoked access; a real upload/private-thumbnail GET; serial-preview exclusion; existing full-page search offsets; and long cards at 320px in dark mode with reduced motion. Desktop/mobile screenshots were inspected, including the final compact fallback. The existing access, location, defect, media, filter, search and palette journeys remain passing. All collection/media fixtures stay in disposable PostgreSQL/MinIO, which the runner removes afterward.

To rerun the relevant journeys:

```sh
pnpm test:integration tests/integration/search.test.ts
pnpm test:e2e:access tests/access-e2e/collection.spec.ts tests/access-e2e/palette.spec.ts
```

The local Docker application is healthy at port 3002: `/api/health` returns 200 and anonymous `POST /api/collection/private` returns 401 with private no-store headers. Existing provider configuration is unchanged; authenticated verification uses the isolated production runner, not live OAuth consent. The known nonfailing pg adapter deprecation remains unchanged. No dependency, migration, schema, personal fixture, public collection endpoint or category CRUD is introduced. See [COLLECTION_VIEWS.md](COLLECTION_VIEWS.md). Next: Task 8.1 — Console Catalog.
