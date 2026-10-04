# Authentication setup

Task 3.2 implements Better Auth 1.7.7 with Google/GitHub OAuth, PostgreSQL sessions and the four library models. `/login` provides the configured providers; `/access-denied` provides signout and a route back to login. The design preview at `/` remains available.

Application permission is still pending Task 3.3. `/app` sends anonymous browsers to login and authenticated browsers to access denied. No OAuth login grants collection access, and no AccessGrant, role management or bootstrap command is implemented by this task.

## Configure providers

Update the existing ignored `.env.local`; preserve its database/storage values. Use the placeholders in [`.env.example`](../../.env.example):

| Variable                                   | Purpose                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------- |
| `BETTER_AUTH_URL`                          | Exact browser origin, including the port in development.                              |
| `BETTER_AUTH_SECRET`                       | Random server-only secret of at least 32 characters; keep it stable between restarts. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google web OAuth client credential pair.                                              |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | GitHub OAuth app credential pair.                                                     |

Either provider can be configured independently. Each enabled provider requires a complete pair plus the URL and auth secret. Empty provider values disable that provider; with neither configured, login buttons remain disabled and auth requests return a generic 503. Incomplete or invalid values fail validation with field names, never secret values.

Generate the secret locally, for example with `openssl rand -base64 48`, and save it directly in the ignored environment file. Never paste credentials into chat, commit them or use `NEXT_PUBLIC_*`. Changing the secret invalidates credential/cookie cryptographic material; treat rotation as an operational change rather than normal development setup.

For the current Docker app, use `http://localhost:3002`. Set the same origin in the provider configuration. When running Next.js locally, use its actual fixed port and register that origin separately; avoid switching ports after creating provider callbacks. The app uses the browser origin even though its internal Docker port is 3000. Production requires an HTTPS origin without paths, credentials, query strings or fragments.

Register the exact callback URLs:

```text
http://localhost:3002/api/auth/callback/google
http://localhost:3002/api/auth/callback/github
```

For Google, create a Web application OAuth client, configure its consent screen/test users as required by the provider, set the browser origin and register the Google redirect URI. For GitHub, create an OAuth app with the matching homepage and callback; use a separate development app when a different callback is needed. Replace the example origin for local or production hosting. Follow the official [Google setup](https://better-auth.com/docs/authentication/google) and [GitHub setup](https://better-auth.com/docs/authentication/github).

Restart the server after changing configuration. Docker Compose forwards these variables explicitly; `.env.local` is not copied into the image. Do not inspect the fully expanded Compose configuration or container environment in shared logs because they include secrets.

## Database and startup

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm db:deploy
pnpm db:generate
pnpm docker:app
```

For local Next.js, start Docker dependencies with `pnpm docker:up`, then run `pnpm dev --port 3001` with `BETTER_AUTH_URL=http://localhost:3001` and matching callbacks. Keep auth migrations applied before testing callbacks; `pnpm dev` generates the client but does not apply database migrations.

Migration `20261004044027_better_auth` adds only `user`, `session`, `account` and `verification`. It adds UUID IDs, cascade deletion of auth dependents, the provider/account uniqueness constraint and lookup/expiry indexes. It creates no application grants, administrator or catalog records. The adapter reuses the existing Prisma connection pool.

The core schema was generated using pinned `auth` 1.7.7 and reviewed before integration. The CLI cannot load `server-only` imports through its config loader. This task used an ignored temporary core-only schema config with the same UUID setting and no plugins; runtime server protections were retained. The project's Prisma datasource/generator output were preserved and the extra indexes/unique constraint added explicitly. Normal development uses Prisma commands, not the auth CLI migrator. Any later plugin/schema change requires another reviewed generation and migration.

## Identity and session behavior

- Google and GitHub use their built-in exchange/profile operations. A guard runs before both first and returning sessions, requires the selected verified email, and normalizes it without merging aliases.
- Google also invokes Better Auth's exported ID-token verifier before using its decoded profile. Invalid signatures, issuer, audience or expiry deny login. The alternative direct ID-token sign-in flow is disabled.
- GitHub retrieves authorized private email information. A different verified secondary address cannot verify an unverified selected address.
- Changed/missing/unverified email on a known provider binding rejects login and deletes its existing local sessions when detected. User.email is never silently rebound. Provider outages do not continuously revoke already valid sessions; fixed expiry bounds identity evidence lifetime.
- Automatic and explicit account linking are disabled. Use the original provider for an existing account. Password signup/login, identity editing, account deletion and token-export/profile endpoints are disabled.
- Sessions last a fixed seven days, without sliding refresh or cookie caching. Production cookies are Secure, HttpOnly, SameSite=Lax and host-only. OAuth state remains checked by the library.
- Browser login/signout POSTs require the exact configured Origin, including first login without cookies. The library's CSRF/origin checks are explicitly enabled in every environment, including tests.
- Private session resolution is server-only and returns only identity IDs/email; it provides no collection permission. The library HTTP `get-session`, `list-sessions` and `list-accounts` endpoints are disabled so their credential-bearing responses are not exposed to the browser. The client uses login/signout, not `useSession`; a future identity display should use an explicitly selected DTO.
- Auth HTTP responses use no-store. Server session/role results are not shared-cached. Auth error logs and visible messages omit provider payloads/credentials.

Production rate limiting uses the library's process-local memory store. Proxy IP headers are not trusted yet; absent a trusted IP, the reviewed library falls back to a shared per-path bucket. Production operations must configure the actual protected reverse proxy before relying on per-client limits. Limits do not survive process restart or coordinate multiple processes. No Redis or rate-limit database table was added.

The module boundaries and later AccessGrant/RBAC handoff are in [AUTH_ARCHITECTURE.md](../architecture/AUTH_ARCHITECTURE.md).

## Verification

Task 3.2 verifies the real Better Auth HTTP callback and Prisma adapter against disposable PostgreSQL, with provider HTTP responses intercepted inside the test runner. Signed Google test tokens exercise the library verifier; GitHub fixtures exercise public/private email selection. No test auth bypass or fake provider is added to application code.

Coverage includes first/returning login, normalization, missing/unverified/changed email, session revocation, blocked linking, invalid Google claims, callback state replay/missing cookie, provider failure, untrusted origins/return URLs, disabled endpoints, fixed expiry and logout. Component checks cover duplicate login starts and retryable generic errors. Desktop/mobile browser checks cover the unconfigured login, denial, redirects and error page alongside the existing UI suites.

The browser suite explicitly blanks OAuth configuration and uses an unavailable test database URL; it cannot use personal credentials or modify the development database. These browser checks do not simulate a completed provider login. Live Google/GitHub consent and redirect verification requires the real provider apps and credentials above. No credentials were available when implementing this task, so live provider login remains unverified.

Verified on 2026-10-04: lint, TypeScript, formatting, the production build, 34 unit/component tests, 30 database integration tests and 38 desktop/mobile browser tests pass. The migration is applied to development PostgreSQL. The refreshed Docker app's login and design preview render without browser errors or a framework overlay; anonymous `/app` redirects to login.

Once credentials are configured, verify each provider's real consent/redirect flow, session creation, denied `/app` destination and signout. Access remains denied until Task 3.3 implements the enabled verified-email grant check. The first administrator and server role permissions remain Tasks 3.3–3.4.
