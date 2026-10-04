# Authentication security review

Task 3.6 · Reviewed 2026-10-04 · Implemented authentication foundation only

The reviewed OAuth, session, AccessGrant and role boundaries do not show an authentication or role-escalation bypass. Two application hardening findings were reproduced and fixed: provider error text surviving in redirect URLs, and unnecessary session mutation endpoints. An optional dependency update removes two published MySQL advisories. Two other upstream dependency advisories remain visible and are assessed below; this is not a clean dependency audit or production certification.

## Scope and trust boundaries

Reviewed the product's authentication requirements, approved authentication architecture, provider adapters/configuration, session resolution, current-grant guards, permission policy, repositories, grant services, operator commands, Prisma schema/migrations, public/private routes, browser controls, environment validation and test fixtures. Better Auth 1.7.7 and its installed callback, session, schema-input and error-redirect implementations were inspected alongside application code.

An anonymous or authenticated browser is untrusted, including submitted email, role, headers, timestamps, IDs and serialized contexts. A provider supplies verified identity; it cannot supply application authority. Current database session/User/AccessGrant state supplies that authority. Local bootstrap/recovery operators and database/configuration access are separate trusted operational powers. The application does not defend against an operator with its database credentials intentionally changing policy.

The exposed surface is `/api/auth/[...all]`, public liveness `/api/health`, public design preview `/`, `/login`, `/access-denied` and private `/app`. There are no application Server Actions, grant-management HTTP endpoints or catalog/collection services yet. Direct guarded grant services were reviewed and tested; future transports and domain features require their own review.

## Findings and fixes

| ID | Application assessment | Finding | Disposition |
| --- | --- | --- | --- |
| AUTH-01 | Medium, conditional information disclosure | OAuth error codes/descriptions were copied into the login URL. | Fixed at the application HTTP response boundary. |
| AUTH-02 | Low, unnecessary exposed surface | Four unused session mutation endpoints remained enabled. | Disabled; valid signed sessions receive 404. |
| DEP-01 | High/moderate upstream; inactive MySQL adapter here | Installed mysql2 3.15.3 matched two advisories. | Locked to 3.23.1 using an exact transitive override. |
| DEP-02 | High upstream; no identified request-input path | Prisma configuration tooling depends on deepmerge-ts 7.1.5. | Open upstream dependency risk, bounded by trusted local configuration. |
| DEP-03 | High upstream; no identified request-input path | CLI/lint tooling depends on braces 3.0.3. | Open; the advisory's 3.0.4 patch is not published in the checked registry. |

### AUTH-01 — Error redirects

Before the fix, a valid Google/GitHub failure callback with fixture `error=private-provider-error&error_description=private-provider-description` returned a Location containing both values. The SDK `/error` endpoint also forwarded them. The login UI already rendered a generic message, but URL history, HTTP access logging and subsequent referrers could retain provider-supplied detail. This proves arbitrary text propagation; it does not prove a provider leaked a real secret or establish an XSS exploit.

The Next.js auth route now replaces error-bearing redirect destinations with the configured origin's `/login?error=sign_in_failed`. It discards descriptions, arbitrary error codes and additional error destination parameters. Auth responses also carry `Referrer-Policy: no-referrer`, protecting callback code/state URLs from subsequent referrer forwarding, and retain private no-store caching. Successful OAuth return destinations remain unchanged. This does not erase the original incoming callback URL from a hosting provider's logs; deployment logging must avoid recording OAuth query strings.

Regressions exercise both providers with genuine library state/cookie validation and the SDK error endpoint through the application's GET handler. They assert the exact generic redirect, no-referrer/no-store headers and absence of a created session. The three redirect tests failed before the fix and pass afterward. Successful login through the application POST/GET handlers remains covered.

### AUTH-02 — Unused session mutation endpoints

`/update-session`, `/revoke-session`, `/revoke-sessions` and `/revoke-other-sessions` were reachable by authenticated browsers, although the application only offers login and signout. They are now explicitly disabled in Better Auth's HTTP path configuration. Normal signout and server-internal session resolution remain supported.

The review did **not** find that `/update-session` could rewrite Session.createdAt, expiresAt, token, userId or grant role: the installed SDK's input parser accepts only configured additional/plugin fields, and this application defines none. A malicious core-field body returned 400 before hardening. Revocation endpoints were scoped by the SDK to the caller's own sessions. Disabling these paths reduces future accidental exposure, including credential-bearing session output if additional fields/plugins are introduced; it is not reported as a demonstrated freshness or cross-user bypass.

Four new regressions call the application POST handler with a real signed cookie and attempted token/timestamp/user/role input. Each now returns 404 without changing the database session or creating a grant, and the original session remains usable. All four endpoint-closure tests failed before the configuration change.

### Dependencies

Full and production dependency scans initially reported three high and one moderate advisory. The installed optional MySQL package is now 3.23.1, compatible with Better Auth's major-3 peer range; no MySQL connection or application adapter was introduced. The remaining application database is PostgreSQL through PrismaPg. Frozen installation, client generation, auth integration and production build verify the updated dependency graph.

Repeated installs initially skipped updated lockfile/override settings while `package.json` was unchanged. `optimisticRepeatInstall: false` now makes the package manager recheck them. The actual patched version was verified in both host and restarted Docker dependency trees. Production server output traces did not include the remaining deepmerge-ts/braces/shadcn CLI tooling packages; this supports, but does not replace, the source-level request reachability assessment.

| Package | Advisory and trigger | Reachability and follow-up |
| --- | --- | --- |
| mysql2 3.15.3 → 3.23.1 | [Authentication downgrade](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr), high; [compressed-protocol inflation](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3), moderate. | Both removed from the lockfile scan. The optional MySQL adapter is unused. Remove the override once parent packages resolve a patched version themselves. |
| deepmerge-ts 7.1.5 | [Recursive object-graph stack exhaustion](https://github.com/advisories/GHSA-ggr8-5vv4-36mx), high; patched in 8.0.0. Plain JSON does not create the required cycles. | Installed through Prisma's configuration loader, which merges trusted local config. Application routes do not import it or merge browser/provider object graphs through it. Keep config trusted; revisit on a supported Prisma/config update. No forced major-version override was introduced. |
| braces 3.0.3 | [Deeply nested pattern stack exhaustion](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), high; the advisory names 3.0.4 as patched. | Present through shadcn's registry/glob tooling and lint tooling. Application code uses shadcn's stylesheet, not its CLI/glob APIs, and accepts no browser/provider glob patterns. Registry checks returned latest 3.0.3 and no matching 3.0.4. Update when a verified patch is actually available; do not process untrusted patterns through these tools. |

Both final scans still report **two high advisories**. They are not suppressed or described as fixed. The current request surface has no identified path to their vulnerable inputs; that assessment must be repeated if configuration, import processing or glob-based features are added. A future production security review must revisit the unresolved advisories before deployment.

## Reviewed controls

| Area | Current protection and evidence |
| --- | --- |
| OAuth identity | Built-in provider exchange/profile adapters; Google JWT signature, issuer, audience, expiry and age verified by the exported library verifier. Alternate browser ID-token login disabled. GitHub selected address must itself be verified; a different verified secondary address is not proof. Signed-token negative tests and real library callbacks exercise these checks with provider HTTP intercepted only in tests. |
| Callback integrity | Library state stored in PostgreSQL, bound to the originating browser cookie and consumed to reject replay. Missing state/cookie and replay are tested. Google authorization uses library PKCE. No custom OAuth protocol, provider or application test bypass was added. |
| Account binding | Stable provider/account uniqueness; automatic and explicit linking disabled. Changed/missing/unverified identity on an existing provider binding denies login and revokes its local sessions when detected. Case/space normalization preserves plus/dot aliases. OAuth never creates or promotes an AccessGrant. |
| Origin and CSRF | Exact configured Origin required for login/signout POSTs even without cookies; library CSRF/origin checks remain enabled. Untrusted origins and external return URLs are rejected in integration tests. OAuth callbacks retain library state protection. |
| Sessions | Opaque signed HttpOnly cookie, Secure in production, SameSite=Lax, host-only; seven-day fixed database expiry, no sliding refresh or cookie session cache. Resolution requires current verified normalized User identity and an unexpired session. Expired, revoked and tampered-session cases fail. Production cookie behavior is exercised over isolated test HTTPS. |
| Grant enforcement | Every private request resolves the enabled grant for verified normalized email. Missing/disabled/unknown-role grants deny access. Role changes, disabling, deletion and re-enabling affect existing sessions at subsequent checks. No browser role/email header authorizes access. |
| Permission escalation | Explicit known-permission matrix, fail-closed unknown roles/permissions. Server-issued context has a private nonserialized marker; service guards reload current identity/grant rather than trusting captured role. Viewer/editor denial, forged contexts and stale authority are tested directly. |
| Sensitive grant writes | Current Session.createdAt must be within five minutes. Client/updatedAt timestamps cannot refresh it. Strict schemas reject injected authority fields. Grant writes check authorization inside the shared locked transaction; final enabled administrator removal is refused. Concurrent administrator changes and rollback are tested. |
| Operator recovery | Bootstrap/recovery are local commands, not web exports. Explicit operator/reason/identity inputs; conflict checks, session revocation and grant changes are transactional. Rebinding relies on an operator's external verification of the replacement identity, as documented; it is not self-service proof. |
| Private/public data | `/app` resolves permissions through server-only feature query/service boundaries and exposes only a role DTO. Public preview uses static example content; health returns liveness only. Auth token/session/account export and identity-edit paths are disabled. Private/auth routes are dynamic and no-store; no shared session/role cache was found. |
| Failure handling | Environment errors contain field names only. Auth SDK logging is reduced to fixed messages. Private guard failures become safe typed errors; unavailable checks do not grant access. Provider credentials are server-only, encrypted OAuth tokens stay in the database, and no private records/credential objects are passed into current client components. |

Authorization applies to checks after a committed policy change; already authorized in-flight operations can finish and previously delivered data cannot be recalled. Future composite services must check every canonical/collection/publication operation inside their write transaction. A page/layout guard or pure permission predicate alone does not authorize a Server Action or API endpoint. [Next.js data-security guidance](https://nextjs.org/docs/app/guides/data-security).

## Remaining operational and future review items

1. Real Google/GitHub consent, app registration and hosted callback behavior remain unverified without actual provider credentials. Integration tests exercise signed fixture claims and real library protocol/persistence, not the providers' live service.
2. Production rate limiting is process-local memory with a shared per-path fallback because no proxy IP headers are trusted. Before hosting, configure the actual protected ingress, verify spoofed forwarding headers cannot select a client identity, and assess aggregate limits across instances. No extra infrastructure is justified for local hobby development.
3. Keep deployment HTTPS, auth secrets, database access, backups and callback query-string logging under the production operations review. Grant mutation reauthentication currently means a new verified OAuth session; provider SSO may satisfy that login without another password prompt. No claim of forced provider password/MFA re-entry is made.
4. Server Actions, grant-management UI/API, public catalog/collection projections, uploads, signed media URLs and enrichment are not implemented. Review their concrete transports, CSRF rules, selected DTOs and operation permissions when their tasks are authorized. Public access never follows merely from a visitor's private role.
5. Reassess the two unresolved upstream advisories on dependency upgrades and before production. Do not silently ignore audit output, force an unreviewed Prisma major dependency, or pin an unpublished package version.

## Verification

Seven added regression cases first failed against the pre-fix behavior and passed after the application fixes. All prior authentication, role, concurrency and browser journeys remain part of the review evidence. Test data lives in disposable PostgreSQL containers; HTTPS browser fixtures sign genuine isolated database sessions and do not create an application bypass. Personal database data and OAuth credentials were not used.

Final verification: lint, typechecking, formatting, diff whitespace and production builds pass, together with **82 unit/component, 137 isolated PostgreSQL integration and 64 desktop/mobile Chromium tests (283 total)**. The refreshed Docker app is healthy; its login/design preview and anonymous private redirect pass browser verification. Test containers were removed. Results are also recorded in the Task 3.6 entry in [DEVELOPMENT_PLAN.md](../../DEVELOPMENT_PLAN.md) and [TESTING.md](../operations/TESTING.md). Dependency audit status is recorded separately above so passing application tests cannot imply that upstream advisories disappeared.

Operational references: [authentication setup](../operations/AUTHENTICATION.md), [grant bootstrap/recovery](../operations/ACCESS_GRANTS.md), [server role policy](../operations/RBAC.md). Library controls were compared with [Better Auth security guidance](https://better-auth.com/docs/reference/security) and [session management](https://better-auth.com/docs/concepts/session-management).
