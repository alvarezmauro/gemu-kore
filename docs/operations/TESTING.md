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

## Database integration tests

`vitest.integration.config.mts` includes only `tests/integration/**/*.test.ts`. Its global setup starts a uniquely named PostgreSQL container using the same pinned image as development. Each run uses:

- An independently generated password and database URL, overriding any inherited `DATABASE_URL`.
- A random loopback-only host port.
- Temporary in-memory database storage, with no development volumes mounted.
- The committed Prisma migrations before tests begin.

The example checks the actual application database health function and transaction helper. A test-only probe table verifies both committed writes and rollback on failure. It is not a domain model and requires no application migration. The database pool is disconnected afterward. Integration files run serially against that run's database; future tests must clean up their own fixtures.

Only the Node integration runners map `server-only` to an empty test helper so server modules can run outside Next.js. The unit/component runner keeps the real module by default; storage-specific unit files explicitly mock its marker to test pure helpers/configuration. Application builds retain the real server-only protection.

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

Run this suite and `pnpm test:e2e` sequentially: both use the checkout's production build output and the same report directory. Normal completion, failed assertions and setup errors clean up the test proxy, temporary certificate and database container. As with integration tests, forcibly killing the runner may leave an abandoned test container; inspect the test label and remove only that exact container. Ports 3110 and 3111 must be free. See [ACCESS_GRANTS.md](ACCESS_GRANTS.md) for authorization and operator procedures.

## Task 5.2 storage checks

`pnpm test:storage` uses `vitest.storage.config.mts` and `tests/storage/`. Global setup builds the same pinned MinIO source as development and starts a uniquely named `gemukore-storage-test-…` container with generated credentials, a random loopback port and temporary in-memory data. No personal bucket, configuration or data volume is used. Completion/assertion/setup failures remove the container; after a forcibly killed runner, inspect the `gemukore.test=true` label and remove only the exact abandoned container.

The 32 checks exercise real private MinIO byte/metadata/range/delete operations and the actual SDK against synthetic HTTP failures. They cover missing bucket/key ambiguity, unsigned denial, incorrect credentials, actual/declared length and hash mismatch, replay safety, bounded retries, cancellation, deadlines through body consumption, malformed ranges, truncated responses and abandoned-stream cleanup. Fixtures deliberately use synthetic bytes because content sniffing/decoding belongs to Task 5.3. Configuration/helper/boundary unit checks bring the unit/component total to 145.

Browser runners explicitly blank the five storage fields so production smoke/access builds do not inherit HTTP development credentials. Run Prisma-generating checks, typechecking and browser builds sequentially in a checkout: concurrent regeneration can transiently remove generated files while another check reads them. Final Task 5.2 totals are 145 unit/component + 32 storage + 198 database integration + 64 desktop/mobile browser checks = 439 passing tests. See [STORAGE.md](STORAGE.md) for configuration and limits. Live cloud-provider compatibility is not claimed.

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
