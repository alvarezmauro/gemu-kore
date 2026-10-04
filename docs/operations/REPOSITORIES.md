# Repository conventions

Task 4.3 implements the persistence conventions approved in [REPOSITORY_ARCHITECTURE.md §§4–6](../architecture/REPOSITORY_ARCHITECTURE.md). Repositories are small server-only modules grouped by the responsibility that owns a query. There is no generic CRUD superclass, query-object endpoint, dependency-injection container or one repository per schema table.

## Implemented foundation

| Module                                             | Operations and purpose                                                                                                                                                                                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/server/repositories/access.ts`                | Existing grant/session-identity persistence, policy lock and operator recovery operations. Authorization remains in the existing auth/service boundaries. Role types now come from the server-local generated client, rather than a feature module. |
| `src/server/repositories/catalog/identities.ts`    | `findConsoleModelIdentity`, `findGameReleaseIdentity`, `findAccessoryVariantIdentity`: product ID, revision, archive/identification state and selected canonical parent identities.                                                                 |
| `src/server/repositories/collection/identities.ts` | `findCollectionItemIdentity`: owned root ID, category, revision and the matching model/release/variant pointer.                                                                                                                                     |

The new functions are base private persistence lookups, not catalog options, detail views, mutation services, public projections or HTTP endpoints. They cover the three established product/copy splits without implementing later category features. No schema, migration, dependency or environment change is required.

## Query shape and naming

Export ordinary named functions for a specific operation. `find...` returns a selected record or null; it does not redirect, translate a missing record into an HTTP status, or guess an identity using a title, slug or another table's UUID. Domain services interpret missing/wrong-category results after validating their inputs.

Every query has an explicit `select`, including nested relationships. Generated persistence types remain server-local; services construct neutral feature DTOs explicitly. Do not spread an ORM record into a browser response or include entire related rows as a shortcut. The new identity selects exclude notes, serials, observed markings, actor/publication fields, specifications, provider evidence and history. Even a narrow owned identity reveals private existence and is not automatically eligible for public delivery.

Inputs are normalized, validated domain criteria supplied by trusted server services. A repository never accepts a submitted Prisma `where`, `select`, `include`, `orderBy` or raw SQL fragment. Prisma binds ID values; UUID/input parsing belongs at the service/request boundary. SQL needed for persistence stays in repositories and uses bound values, with identifiers controlled by application code.

Archive state is deliberately returned rather than filtering out a retained catalog reference. Services must distinguish resolving an existing copy from choosing a product for a new operation. A repository does not silently decide that an archived product or parent is active. No provider payload, media use or compatibility list is loaded by an identity read.

The base lookups use primary keys and bounded to-one relationships. They are not list/search primitives. Later list queries must have a fixed allowed filter/sort vocabulary, bounded page size, deterministic tie-breaking and deliberate batched relationship reads. Do not call single-item lookups in a loop to construct a collection list. Search query design and its indexes remain Phase 7.

## Transactions and permissions

Reads use the existing convention:

```ts
export function findGameReleaseIdentity(
  id: string,
  database: TransactionClient = getDatabase(),
) {
  // The implementation uses this database handle for its explicit query.
}
```

This signature illustrates the convention; the actual function is implemented in the catalog repository. A standalone authorized read can use the shared lazy database client. When a service is already in a transaction, it must pass that handle to every repository participating in that operation. Omitting the argument opens the ordinary shared-client read path; it does not discover an ambient transaction. The integration tests demonstrate that the explicit transaction sees its uncommitted writes while a separate shared-client read does not.

The outer use-case service owns `withTransaction`. Existing mutation repository functions require a transaction argument, with no default client. They do not open, commit, retry or nest transactions. `TransactionClient` is Prisma's structural type, not proof of authorization or proof that a caller actually began a transaction; callers must follow this convention. Keep input/domain validation, actor attribution, permission checks, revision checks, catalog provenance and publication approval in services.

A service coordinating a validated private read can use this pattern, after resolving a trusted access context:

```ts
return withTransaction(async (transaction) => {
  await requirePermission(context, "private.read", transaction);
  const record = await findGameReleaseIdentity(parsedId, transaction);
  return record ? { id: record.id, revision: record.revision } : null;
});
```

This is a responsibility example, not a new application service. Mutations must check their own current operation-specific permission inside the transaction. An editor creating a copy is not authorized to create a canonical product. Existing grant-management writes must retain their policy lock, fresh-session check and final-administrator rules; do not bypass those services by directly calling a grant repository from a request.

Use one transaction for an owned root and its matching child; catalog facts/revision/history must also commit together. When concurrent edits require consistency, the service must choose the appropriate isolation/locking/revision strategy. Merely passing a Read Committed transaction does not make multiple queries a snapshot or provide optimistic concurrency control. External requests, uploads and expensive transformations stay outside the transaction. The existing helper retains its acquisition/transaction limits.

Repositories preserve database errors for their server caller. Services interpret expected absence/conflict and request entry points translate safe outcomes; unexpected failures must not return SQL, stack traces or private row values. No universal error-swallowing wrapper is added.

## Import and audience boundaries

Application repositories import `server-only` and depend downward on the database client/types and persistence helpers. They do not import React, routes, feature modules, auth/cookie resolution, services or external adapters. Services may import neutral feature contracts and own the transaction, but not UI/action/query entry points or the raw database client. The access repository retains its current file path so existing callers keep working.

ESLint now requires the repository marker, rejects upward imports, rejects importing `withTransaction` into repositories and rejects direct `$transaction` calls there. Existing UI-to-database/repository restrictions remain active. Focused tests run the actual ESLint configuration against permitted and rejected examples. These checks enforce common static import/call patterns; they are not a runtime authorization system, complete transitive dependency analysis or a sandbox for dynamic imports/aliased calls.

Future public persistence belongs in `repositories/public/`, with purpose-built publication predicates and explicit allowlisted projections. It must not wrap a private identity/detail read and remove fields afterward. No public repository or empty future directory is created in Task 4.3. Public services/queries remain Phase 18; media/enrichment/settings repositories arrive with their actual features.

## Verification

Eighteen new unit cases exercise repository/service/UI import boundaries and transaction ownership. Nine new isolated PostgreSQL cases verify missing/wrong-kind IDs, narrow canonical and all three owned identity results, archive preservation, supplied-transaction visibility, commit/rollback and existing access persistence. Their fixtures are synthetic and their cleanup uses only the disposable test database.

A focused trace also identified a nonfailing pg 8.23.1 deprecation warning inside Prisma's PgTransaction adapter when it dispatches nested relation reads. Application transaction calls in these repositories are awaited. Keep the existing driver/adapter pins; verify upstream adapter compatibility before a future pg 9 upgrade. The warning is not suppressed and does not invalidate the passing visibility/rollback tests.

The existing auth, grant, permission and schema tests continue to run. Current complete check counts and local browser verification are recorded in [TESTING.md](TESTING.md). This task does not claim implemented domain CRUD, publication services, DTOs, pagination or storage adapters.

The conventions follow Prisma's [explicit field selection](https://www.prisma.io/docs/orm/v7/prisma-client/queries/select-fields) and ESLint's [restricted-import rule](https://eslint.org/docs/latest/rules/no-restricted-imports). The primary-key lookup/index review also applies the previously adopted Supabase Postgres best-practices skill. No Supabase service or new library is required.
