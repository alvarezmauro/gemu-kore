# Access grants

Task 3.3 implements private access using the verified identity from Task 3.2 and a current application-owned grant. OAuth login alone does not grant access. `/app` requires both an unexpired database session with a verified normalized email and an enabled `AccessGrant` for that exact email. Missing or disabled grants lead to `/access-denied`; missing identity leads to `/login`. Database failures render a generic unavailable state without granting access.

## Model and authorization boundary

Migration `20261004052032_access_grant` adds `access_grant` and the `AccessRole` enum (`ADMIN`, `EDITOR`, `VIEWER`). Grants have UUID IDs, unique normalized email, role, enablement and timestamps. Enablement defaults to false; role has no default. A database check rejects empty, surrounding-space or uppercase email values; application services also validate email syntax. Normalization trims and lowercases without merging plus aliases or stripping dots.

There is no User foreign key and no User.role. A grant can exist before its owner signs in. Disabling/deleting a grant does not delete identity or session records. Roles live on grants; no browser header, cookie role, OAuth callback role or remembered render result can supply permission.

`src/server/auth/access.ts` resolves the real signed session and current grant on each private request. Its immutable `PrivateAccessContext` stays on the server. A private symbol rejects contexts reconstructed from JSON. `revalidatePrivateAccess` reloads session, verified User email and current grant/role using the caller's transaction; future mutation services must call it before writes. It does not accept a role captured by an earlier page render as authority.

`src/server/services/access.ts` returns only the role needed by the private welcome page. Feature queries handle request headers and transport errors; React contains no grant query or permission logic. Private pages are dynamic and not shared-cached. A committed disable/delete or role change affects the next authorization check, including an existing session. Already authorized operations may finish; already delivered data cannot be recalled.

Task 3.4 will add role-to-permission policy, service enforcement, ordinary grant management with fresh-login and last-admin safeguards. No grant-management HTTP endpoint or Server Action is exposed by Task 3.3. The current private page is a welcome screen, not implemented collection management.

## First administrator

Use the repository's configured Node.js/pnpm versions and ignored `.env.local`. These commands use its database connection; do not override it with an unrelated database URL. Apply migrations first:

```sh
pnpm db:deploy
pnpm access:bootstrap --email 'your-exact-verified-email@example.com' --operator 'your-name'
```

Replace the example email with the address actually selected and verified by your Google/GitHub login. Google aliases and GitHub secondary addresses do not automatically match another address. Bootstrap validates/normalizes explicit input, acquires the grant-policy lock and creates exactly one enabled ADMIN grant when no enabled administrator exists. Repeating bootstrap for an existing enabled ADMIN is an idempotent no-op. Another administrator or an existing disabled/differently roled grant causes a refusal; use explicit recovery for a mistaken grant.

Bootstrap does not create a User, provider binding, password, verified identity or session. It does not verify email ownership itself. The owner must sign in through the normal verified provider flow. Configure OAuth using [AUTHENTICATION.md](AUTHENTICATION.md); without configured providers, a grant cannot establish a session. There is no default administrator, permanent bootstrap environment override, public setup endpoint or first-login promotion.

The bootstrap operator defaults to the local OS username when omitted. A JSON receipt records outcome, grant ID, normalized email, operator and time. Keep this receipt in your operator log. It contains personal identifiers but no provider credentials or session tokens. The command reports generic setup errors and exits unsuccessfully when validation or database access fails.

No real administrator address was supplied during implementation, so no administrator was automatically provisioned.

## Trusted operator recovery

Recovery is an explicit local operation for someone who controls the server/database. It is available when web access is denied. Verify control of the replacement provider identity and its exact verified email before running it; the CLI has no provider consent flow. Supply both operator and reason:

```sh
pnpm access:recover --email 'verified-admin@example.com' --operator 'your-name' --reason 'Restore administrator access'
```

This explicitly restores or promotes the target to enabled ADMIN and revokes all sessions for that email. Unlike bootstrap, recovery can run when another administrator exists. It is a deliberate operator action, not ordinary web grant administration.

For a mistaken old grant or an inaccessible old identity:

```sh
pnpm access:recover --email 'replacement@example.com' --previous-email 'old@example.com' --operator 'your-name' --reason 'Replace inaccessible identity'
```

The same transaction enables the target ADMIN, disables the old grant if present and revokes sessions for both emails. It leaves Users and provider bindings intact. The replacement signs in normally afterward. There is no automatic account linking.

When an existing provider account changed email and preserving its User ID is appropriate, the provider guard will continue rejecting the changed identity until an explicit controlled rebind. After independently verifying replacement identity control, use the known existing User UUID:

```sh
pnpm access:recover --email 'new@example.com' --previous-email 'old@example.com' --rebind-user 'existing-user-uuid' --operator 'your-name' --reason 'Verified provider email change'
```

Rebinding requires a pre-existing verified User with exactly the previous email and rejects a target email already owned by another User. It preserves User ID, provider account bindings and the existing verification flag; it does not fabricate verification evidence or create a new identity. It revokes old/new sessions and changes the email within the same transaction. The next login must still satisfy the normal provider verification and stable account-binding checks. Do not use this option to merge different provider accounts or bypass the disabled account-linking policy.

Save the recovery receipt, which includes operator, reason, previous/target email, optional rebound User ID and revoked-session count. No separate audit entity is introduced before the planned audit facilities exist. Invalid identity input rolls back all changes.

## Transaction convention

Every application grant-policy write must use `withAccessGrantTransaction`, acquiring transaction-scoped advisory lock `(1195724117, 1094927187)` before policy reads. Read Committed ensures a competing operator sees the preceding committed grant after waiting. The lock releases automatically at transaction end. Keep provider calls and other external work outside this short transaction. Direct manual SQL does not participate in this convention and should not be used for routine grant changes. [PostgreSQL advisory lock reference](https://www.postgresql.org/docs/16/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS).

## Verification

Integration checks use only disposable PostgreSQL. They cover all three roles, missing/disabled/deleted grants, role changes with the same session, alias separation, unverified identity, forged client authority, expired/revoked sessions, generic database failure, bootstrap idempotency/concurrency, recovery rollback and actual CLI execution. Real library OAuth callbacks with intercepted provider responses also exercise grant enforcement.

`pnpm test:e2e:access` verifies the production app on desktop/mobile Chromium using a separate temporary database, signed fixture sessions and test-only local HTTPS. It verifies private welcome access, role/enablement/deletion changes and real signout. It adds no authentication bypass to application code. Live provider consent remains unverified until real OAuth credentials are configured. See [TESTING.md](TESTING.md) for isolation and commands.

Verified on 2026-10-04: lint, TypeScript, formatting, schema validation and production build pass, along with 43 unit/component tests, 57 database integration tests, 38 existing browser tests and 12 authorized-access browser tests. The development database migration is applied and current. Docker services are healthy; the refreshed app's login/design preview render without browser errors or a framework overlay, and anonymous `/app` redirects to login. Disposable test containers were removed after verification.
