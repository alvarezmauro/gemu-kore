# Server authorization

Task 3.4 implements the ADMIN/EDITOR/VIEWER permission policy and guarded access-grant services. A role always comes from the current enabled AccessGrant matched to verified session identity. Browser values, UI visibility and roles captured by earlier requests do not authorize an operation.

## Permission matrix

| Permission           | Purpose                                                     | ADMIN | EDITOR | VIEWER |
| -------------------- | ----------------------------------------------------------- | ----- | ------ | ------ |
| `private.read`       | Read private collection and select existing catalog entries | Yes   | Yes    | Yes    |
| `collection.manage`  | Manage owned copies, contents, defects and locations        | Yes   | Yes    | No     |
| `media.manage`       | Upload/manage private collection media                      | Yes   | Yes    | No     |
| `enrichment.suggest` | Retrieve candidates and prepare/review saved suggestions    | Yes   | Yes    | No     |
| `catalog.manage`     | Create/edit/delete canonical catalog records                | Yes   | No     | No     |
| `enrichment.accept`  | Apply canonical enrichment changes                          | Yes   | No     | No     |
| `publication.manage` | Change publication and approve public media                 | Yes   | No     | No     |
| `settings.manage`    | Change application settings                                 | Yes   | No     | No     |
| `access.read`        | List access grants                                          | Yes   | No     | No     |
| `access.manage`      | Create/change/delete grants, with fresh login               | Yes   | No     | No     |

Unknown roles or permission names are denied, including unknown permissions supplied for ADMIN. `src/server/policies/permissions.ts` is a pure policy module with no cookies, database or provider operations. Calling its boolean predicate alone is not authentication or service authorization. It stays independent of unfinished domain implementations; no role plugins, per-user overrides or dynamic permission entities are added.

## Required service boundary

`src/server/auth/permissions.ts` exports the server-only `requirePermission(context, permission, transaction?)`. It accepts only a context originally resolved on the server by `requirePrivateAccess` from actual request headers. It reloads the current unexpired session, verified normalized User email and enabled grant before evaluating the permission. A serialized/client-built context is rejected. The returned context reflects the current role rather than the captured role.

Services enforce permissions before private queries or writes. The existing private welcome service now requires `private.read`. For each future domain mutation, the outer service opens its transaction, calls `requirePermission` with that transaction, validates domain invariants and passes the same transaction to repositories. Do not move the guard into a React component, rely on a private layout, or accept an actor from submitted JSON. Transport code resolves context; service code enforces the operation. This follows the [Next.js authorization guidance](https://nextjs.org/docs/app/guides/authentication).

Composite workflows must check every distinct operation. An editor adding a copy may select an existing release with copy-management permission. Creating a missing release requires a separate `catalog.manage` check in the canonical service, including when called inline by another service. Enrichment suggestions do not confer `enrichment.accept`, catalog or publication authority. External provider generation/uploads happen outside short database transactions; persistence still needs its own current permission check.

Catalog, copy, media, settings and publication services/tables do not exist yet. This task defines their policy and reusable server guard; it does not implement those future features. Integration tests use a disposable transaction probe to demonstrate that a denied inline canonical step rolls back earlier writes. Those tests verify the guard/transaction contract, not a completed add-copy flow.

Signing out remains available without a grant. Public routes must use dedicated public projections/publication gates regardless of a visitor's role; this private guard is not a public-data policy. Revocation applies to authorization checks after a committed policy change; operations authorized earlier may finish and delivered data cannot be recalled.

## Grant-management services

`src/server/services/access.ts` provides:

- `listAccessGrants(context)` requires `access.read` and returns only grant ID, email, role and enabled state. No session/provider credentials or User records are returned.
- `createAccessGrant(context, input)` accepts normalized email, an explicit valid role and optional enablement (default false). Duplicate normalized email is a conflict; it never creates a User/session or silently promotes an existing grant.
- `updateAccessGrant(context, input)` accepts only grant UUID, role and enabled state. It cannot rename grant email or rebind identity; controlled identity recovery remains the explicit operator procedure.
- `deleteAccessGrant(context, input)` accepts only grant UUID. Prefer disabling when retaining grant history is useful. Deletion does not cascade into identity or content.

Every grant mutation acquires the same transaction-scoped PostgreSQL advisory lock as bootstrap/recovery before resolving the actor's current permission and reading policy. Read Committed ensures a waiting operation sees committed grant changes before its subsequent checks. The lock releases at transaction completion. Direct manual SQL does not follow this convention and is not routine grant management. [PostgreSQL isolation reference](https://www.postgresql.org/docs/16/transaction-iso.html).

After authorization, services validate strict input and reject unexpected authority fields. They check the proposed final state before mutating. Disabling, demoting or deleting the final enabled ADMIN is refused; a disabled ADMIN does not count as a backup. Self-demotion is allowed when another enabled administrator remains. Subsequent calls using the demoted actor's earlier context are denied by current policy. Competing self/other administrator changes are serialized and cannot remove all enabled administrators.

There are no grant-management routes, Server Actions or screens exposed by this task. These guarded services are ready for later application features. A future transport must preserve service guards, enforce its origin/CSRF boundary and return safe structured errors. Operator bootstrap/recovery remain local commands with explicit operator authority, never web exports. See [ACCESS_GRANTS.md](ACCESS_GRANTS.md).

## Fresh login and errors

Grant mutations require a live session created within the preceding five minutes, using the current database Session.createdAt. Session.updatedAt, a browser timestamp, role promotion or a normal private read does not renew that window. A future creation timestamp or invalid date also fails the check. Grant listing and ordinary private operations do not impose this sensitive-operation window.

`REAUTHENTICATION_REQUIRED` means sign out and complete the normal verified OAuth login again, producing a newly created session. There is no public endpoint to mark a session fresh or manually update its creation time. Better Auth remains responsible for session creation and fixed expiry. [Session management reference](https://better-auth.com/docs/concepts/session-management).

`PermissionError` returns only `FORBIDDEN` or `REAUTHENTICATION_REQUIRED` with fixed safe messages. Missing/disabled identity remains `PrivateAccessError`; unexpected guard/database failures become generic `UNAVAILABLE`. Grant validation/conflict/not-found/last-admin failures use `GrantManagementError`. Future transport code maps these expected outcomes without exposing stack traces, SQL, secrets or private records.

## Verification

Pure unit checks explicitly cover every permission for all three roles, unknown role/permission values and the five-minute boundary. Disposable PostgreSQL integration checks exercise real signed database sessions, direct permission/service calls, rollback for inline canonical denial, stale role/session/grant state, fresh login, strict inputs and concurrent administrator changes. Desktop/mobile browser checks exercise the existing protected welcome and signout through the production app.

No new dependency or migration is required. Real OAuth consent remains unverified until provider credentials are configured, and no real administrator is provisioned without its exact verified email.

Verified on 2026-10-04: lint, TypeScript, formatting and production build pass, along with 72 unit/component tests, 110 isolated database integration tests and 50 desktop/mobile browser tests (38 existing checks and 12 authorized-access journeys). Docker services remain healthy; anonymous private entry redirects to the login screen without browser errors or a framework overlay. Disposable test containers were removed after verification.
