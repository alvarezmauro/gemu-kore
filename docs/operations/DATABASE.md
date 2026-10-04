# Database development

The foundation uses PostgreSQL **16.15** and Prisma **7.10.0**, with matching client and PostgreSQL adapter versions. Task 1.2 established the `public` schema and migration history; Phase 3 added authentication/policy tables. Task 4.1 adds the approved core catalog and owned-collection structures. See [Core database contracts](CORE_DATABASE.md) for the model inventory, deletion rules, SQL invariants and deferred features.

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

For an existing set of reviewed migrations, use `pnpm db:deploy`. This applies pending migrations without generating schema changes or resetting data. Production migration credentials and permissions will be separated from application runtime access during deployment work. No startup hook runs migrations or creates a database automatically. Do not use `db push` or an automatic reset; they bypass the reviewed migration workflow and custom SQL constraints. Task 4.1 creates safe settings defaults, without placeholder catalog, collection or administrator seed data.

Generated Prisma files live under `src/server/db/generated/` and are ignored. The `dev`, `build`, `typecheck` and `db:check` commands generate them explicitly, so a clean checkout does not depend on an untracked client from another machine.

## Database access and health

`src/server/db/client.ts` lazily creates one server-only Prisma client and reuses it across requests and hot reloads. Its PostgreSQL adapter has a maximum of five connections, a five-second connection/acquisition timeout, ten-second idle timeout and ten-second statement timeout. New process instances each have their own pool; deployment capacity planning must account for their combined limits.

Repositories use the client; service use cases use `withTransaction` to coordinate repositories within a single transaction. The helper has a five-second acquisition limit and ten-second transaction timeout. Keep provider calls and other slow external work outside transactions. `disconnectDatabase` is for short-lived operational commands, not normal request cleanup.

Two checks serve different purposes:

- `GET /api/health` is public **liveness**: `{ "status": "ok" }`, with `Cache-Control: no-store`. It does not connect to PostgreSQL or disclose configuration.
- `pnpm db:check` is an operator-only connectivity check through the actual Prisma client, using a read-only `SELECT 1`. It exits nonzero on missing/invalid configuration or connection failure and omits raw errors/credentials. It does not verify migration currency; use `pnpm db:status` for that.

There is no public database-readiness endpoint before an operational authorization mechanism is introduced. ESLint prevents database/repository imports in UI and route modules, and `server-only` prevents application database modules from entering client bundles. The schema-only environment validator is shared with the standalone Prisma CLI and contains no environment values.

Connection setup follows Prisma's [PostgreSQL adapter documentation](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql). Migration commands follow its [Prisma 7 development and production workflow](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/development-and-production).

## Task 1.2 verification

Verified on 2026-10-02 against the local PostgreSQL 16.15 instance:

- Schema validation, initial migration, migration status and development drift check passed.
- A separate disposable database accepted the migration and a second deployment made no changes.
- The real Prisma client reused its instance, committed a transaction and rolled back a failed transaction. Verification tables and the disposable database were removed afterward.
- Missing/malformed URLs and an unreachable database failed safely without printing connection credentials.
- Lint, typechecking, formatting and a production build without `DATABASE_URL` passed.
- Production liveness and the starter page worked with an unreachable database; the health response contained only `status` and disabled caching.

These were task verification checks, not a committed test suite. Reusable test infrastructure remains Task 1.4.
