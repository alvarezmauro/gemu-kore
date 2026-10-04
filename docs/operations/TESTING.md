# Testing

Task 1.4 establishes Vitest, React Testing Library and Playwright. Tests exercise the existing foundation; collection features, authentication and storage integration will receive coverage as they are implemented.

## Setup and commands

Use the repository's Node.js and pnpm versions. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm test:e2e:install
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm test:e2e:access
```

Unit/component tests need only Node.js. Integration tests also need a running Docker engine and its CLI. Browser tests need Playwright's Chromium download. On a Linux CI runner, use `pnpm exec playwright install --with-deps chromium` to install browser system dependencies as well.

| Command                            | Purpose                                                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `pnpm test`                        | Run unit and component tests once; no Docker or database needed.                                                  |
| `pnpm test:watch`                  | Watch unit and component tests during development.                                                                |
| `pnpm test:integration`            | Generate Prisma, provision isolated PostgreSQL, apply migrations, run integration tests and remove the container. |
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

Only the integration runner maps `server-only` to an empty test helper so server modules can run outside Next.js. The unit/component runner and application builds keep the real server-only protection.

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

Desktop/mobile checks cover all three enabled roles, absent grants with forged role/email headers, role change/disable/re-enable/delete on the same session, private response cache policy and signout through the real auth route. Tests run with one worker and reset only disposable fixtures. The config and fixture commands reject execution without the isolated database/origin markers. Never use these fixture helpers against development data.

Run this suite and `pnpm test:e2e` sequentially: both use the checkout's production build output and the same report directory. Normal completion, failed assertions and setup errors clean up the test proxy, temporary certificate and database container. As with integration tests, forcibly killing the runner may leave an abandoned test container; inspect the test label and remove only that exact container. Ports 3110 and 3111 must be free. See [ACCESS_GRANTS.md](ACCESS_GRANTS.md) for authorization and operator procedures.

## Task 1.4 verification

Verified on 2026-10-03:

- Nine unit/component tests, three database integration tests and four desktop/mobile browser checks pass.
- Lint, TypeScript, formatting and the production build pass.
- An intentional temporary failing test returns a failure status and still removes its database container; the temporary test was removed after verification.
- Playwright stops its production server afterward. The existing local and Docker development previews remain available.
- No domain schema changes or migrations were needed.

## References

The setup follows the official [Next.js Vitest guide](https://nextjs.org/docs/app/guides/testing/vitest), [Vitest global setup](https://vitest.dev/config/globalsetup), [React Testing Library setup](https://testing-library.com/docs/react-testing-library/setup/) and [Playwright web server guidance](https://playwright.dev/docs/test-webserver).
