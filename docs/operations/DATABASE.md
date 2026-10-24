# Database development

The application uses PostgreSQL **16.15** and Prisma **7.10.1**, with matching client and PostgreSQL adapter versions. Committed migrations cover authentication/grants, catalog and owned copies, assets, search, enrichment, physical templates and public privacy. The [core database contracts](CORE_DATABASE.md) and [schema review](../architecture/PRISMA_SCHEMA_REVIEW.md) explain the foundational invariants; later feature migrations extend them. Apply the complete migration directory on a fresh database rather than choosing only the original core migrations.

## Local connection

Task 1.3 now manages PostgreSQL through Compose, reusing the Task 1.2 volume `gemukore-postgres-data` and its existing credentials. The service listens only on `127.0.0.1:5433`, with database/user `gemukore`. Start the local dependencies with:

```sh
pnpm docker:up
```

Follow [Docker development](DOCKER_DEVELOPMENT.md) for first-time setup, the optional containerized app and the standalone-container handoff. Preserve `.env.local`; `.env.example` contains illustrative credentials, not the generated password. Initialization variables apply only to an empty volume, so changing them does not rotate an existing password. The local role can create shadow databases for migrations; it is not a production role configuration.

Prisma commands and operational scripts load environment files through `@next/env`, using the same precedence as Next.js. Shell-provided values win; `.env.local` is not loaded in test mode. Production commands use `NODE_ENV=production`. Keep connection strings out of public environment variables, logs, screenshots and Git.

Then run:

```sh
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:validate
pnpm db:deploy
pnpm db:status
pnpm db:check
pnpm dev
```

The database must be reachable for migrations and `db:check`. Client generation, lint, typechecking and builds require neither a running database nor a database URL. If a URL is supplied, it must be valid. A missing URL is rejected when an operation actually requests a database connection.

## Migration workflow

For a reviewed schema change in its assigned task:

```sh
pnpm db:migrate --create-only --name describe_the_change
# Review prisma/migrations/<timestamp>_describe_the_change/migration.sql.
pnpm db:migrate
pnpm db:generate
pnpm db:status
```

Use `migrate dev` only on a dedicated development database; it uses a shadow database and can propose a reset when it finds drift. Do not accept a reset on valuable data. Applied migration files are immutable: add a new migration for subsequent changes. Commit the schema, migration SQL, migration lock and package lock together.

For an existing set of reviewed migrations, use `pnpm db:deploy`. This applies pending migrations without generating schema changes or resetting data. Host development and the optional development app do not migrate automatically. Do not use `db push` or an automatic reset; they bypass the reviewed migration workflow and custom SQL constraints. Initial settings keep public collection/indexing disabled. Migrations create no placeholder catalog, owned collection or administrator; console seed validation also writes no data.

## Production migrations and release recovery

Production separates the `postgres` administration role, `gemukore_migrator`
schema owner/operator role and `gemukore_app` runtime role. The production Compose
`migrate` service applies committed migrations using the operations image, then
revokes runtime access to `_prisma_migrations`. The app waits for this service to
succeed. It also waits for storage setup; `/api/health` alone cannot prove either
dependency is usable. See the [deployment workflow](PRODUCTION_DOCKER.md).

Use the matching release's operations image and production environment file for
status or an explicit reviewed migration run:

```sh
docker compose --env-file .env.production -f docker-compose.production.yml run --rm operations db:status
docker compose --env-file .env.production -f docker-compose.production.yml run --rm migrate
```

Do not run host `pnpm db:migrate` against production, bypass the migration wrapper
with runtime credentials, or edit `_prisma_migrations` to conceal a failure. A
failed migration keeps the app from starting; inspect its private diagnostics and
the migration before deciding how to repair it. Preserve applied SQL and prepare
a reviewed forward repair when appropriate.

Take a [verified matched backup](BACKUP_RESTORE.md) of the old release before
switching revisions or applying new migrations. It includes the database,
Garage objects/metadata, private environment and proxy state. Reverting a web
image does not undo schema/data changes. If rollback needs data recovery, use the
matching old release and restore the complete set into fresh volumes, then review
the recovered installation before cutover. Database and object snapshots must
remain paired.

## Generated client and latest migration

Generated Prisma files live under `src/server/db/generated/` and are ignored. The `dev`, `build`, `typecheck` and `db:check` commands generate them explicitly, so a clean checkout does not depend on an untracked client from another machine.

Task 23.2 adds `20261023000000_bounded_asset_eligibility`, replacing the public
asset eligibility function without changing stored rows or extending timeouts.
It traverses at most 128 unique assets and measures the longest source path,
failing closed beyond depth 16 or on cycles/unapproved sources. Apply it before
the updated application through the normal deployment workflow. See the
[final review remediation](../architecture/FINAL_REVIEW_REMEDIATION.md).

## Database access and health

`src/server/db/client.ts` lazily creates one server-only Prisma client and reuses it across requests and hot reloads. Its PostgreSQL adapter has a maximum of five connections, a five-second connection/acquisition timeout, ten-second idle timeout and ten-second statement timeout. New process instances each have their own pool; deployment capacity planning must account for their combined limits.

The [repository conventions](REPOSITORIES.md) define explicit selected records and caller-supplied transaction handles. Repositories use the client; service use cases use `withTransaction` to coordinate repositories within a single transaction. The helper has a five-second acquisition limit and ten-second transaction timeout. Keep provider calls and other slow external work outside transactions. `disconnectDatabase` is for short-lived operational commands, not normal request cleanup.

Two checks serve different purposes:

- `GET /api/health` is public **liveness**: `{ "status": "ok" }`, with `Cache-Control: no-store`. It does not connect to PostgreSQL or disclose configuration.
- `pnpm db:check` is an operator-only connectivity check through the actual Prisma client, using a read-only `SELECT 1`. It exits nonzero on missing/invalid configuration or connection failure and omits raw errors/credentials. It does not verify migration currency; use `pnpm db:status` for that.

There is no public database-readiness endpoint. ESLint prevents database/repository imports in UI and route modules, and `server-only` prevents application database modules from entering client bundles. The schema-only environment validator is shared with the standalone Prisma CLI and contains no environment values.

Connection setup follows Prisma's [PostgreSQL adapter documentation](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql). Migration commands follow its [Prisma 7 development and production workflow](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/development-and-production).

## Task 1.2 verification

The following is historical foundation evidence. Current suite commands and
later migration coverage are recorded in [Testing](TESTING.md).

Verified on 2026-10-02 against the local PostgreSQL 16.15 instance:

- Schema validation, initial migration, migration status and development drift check passed.
- A separate disposable database accepted the migration and a second deployment made no changes.
- The real Prisma client reused its instance, committed a transaction and rolled back a failed transaction. Verification tables and the disposable database were removed afterward.
- Missing/malformed URLs and an unreachable database failed safely without printing connection credentials.
- Lint, typechecking, formatting and a production build without `DATABASE_URL` passed.
- Production liveness and the starter page worked with an unreachable database; the health response contained only `status` and disabled caching.

These were task verification checks, not a committed test suite. Reusable test infrastructure remains Task 1.4.
