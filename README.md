# GemuKore

A self-hosted web application for managing and showcasing a physical video game
collection. Canonical catalog records stay separate from the consoles, games and
accessories you own.

The application includes verified Google/GitHub sign-in with allowlisted roles,
copy management, photos, defects, nested locations, search and filters, a dashboard,
reviewed metadata enrichment, optional 3D views and a public collection with
server-enforced privacy controls. The interface supports mobile, light/dark themes,
keyboard navigation and reduced motion.

**Production approval remains withheld.** The
[final remediation report](docs/architecture/FINAL_REVIEW_REMEDIATION.md) records
open proxy, storage and native-package findings. Completing the development plan
or passing local tests does not clear those findings or deploy a live site.

## Requirements

- Node.js **24.x, at least 24.20.0 and below 25**, as required by `package.json`.
  `.node-version` and the development image use 24.20.0; production Docker pins
  24.22.1 separately.
- pnpm **11.28.8**, matching `packageManager` and `engines`.
- Docker with the Compose plugin for PostgreSQL, development MinIO and isolated
  integration tests. Start the Docker engine before using those commands.
- Playwright Chromium for browser tests; OpenSSL for the authenticated and
  production HTTPS test runners.

## Start local development

Run from the repository root:

```sh
# Preserve an existing file and its database/storage credentials.
test -f .env.local || cp .env.example .env.local
chmod 600 .env.local
pnpm install --frozen-lockfile
pnpm docker:up
pnpm db:deploy
pnpm db:status
pnpm db:check
pnpm dev
```

The example credentials are for local development only. PostgreSQL normally binds
to `127.0.0.1:5433`; MinIO's API/console bind to ports 9000/9001. Next.js normally
prints [localhost:3000](http://localhost:3000), choosing another port if occupied.
The first MinIO build compiles the pinned source and may take several minutes.
See [Docker development](docs/operations/DOCKER_DEVELOPMENT.md) for ports,
persistence, restarts and the optional containerized app at
[localhost:3002](http://localhost:3002) through `pnpm docker:app`.

Complete these steps before using the private collection:

1. In the local [MinIO console](http://localhost:9001), sign in with the
   `MINIO_ROOT_*` values from your private `.env.local` and create the bucket named
   by `S3_BUCKET` (default `gemukore-dev`). Keep it private. Startup does not create
   the development bucket.
2. Configure Google and/or GitHub credentials in `.env.local`, with
   `BETTER_AUTH_URL` set to the exact browser origin and a randomly generated
   `BETTER_AUTH_SECRET` of at least 32 characters. Register the matching callbacks
   in the [authentication guide](docs/operations/AUTHENTICATION.md). Empty provider
   pairs leave sign-in disabled; OAuth alone does not grant collection access.
3. Create the first administrator grant using the exact email verified by the
   intended provider account:

   ```sh
   pnpm access:bootstrap --email 'your-exact-verified-email@example.com' --operator 'your-name'
   ```

4. Restart the application after environment changes, then sign in at `/login`
   and open `/app`. See [access grants and recovery](docs/operations/ACCESS_GRANTS.md)
   for identity rules and operator recovery.

The `/` entry redirects to `/collection`. A fresh database keeps public publication
and indexing disabled. `/app` is the private dashboard; `/design-preview` is the
separate static design reference. Administrators manage catalog records through
`/app/catalog` and review publication through `/app/settings/public`.

## Configuration and optional metadata

[.env.example](.env.example) documents local settings;
[.env.production.example](.env.production.example) belongs to the separate
production stack. Never replace an existing private environment file with either
template during an upgrade. Next.js/Prisma load `.env.local`; development Compose
explicitly uses `--env-file .env.local`. Shell values can override those files.
Next.js sets `NODE_ENV`; do not put a custom value in either template.

Storage configuration is all-or-none and uses private buckets. Production requires
HTTPS and a scoped identity. Optional [IGDB lookup](docs/operations/GAME_METADATA.md)
uses a complete `IGDB_CLIENT_ID`/`IGDB_CLIENT_SECRET` pair. Optional
[Wikidata accessory lookup](docs/operations/ACCESSORY_ENRICHMENT.md) uses
`ACCESSORY_METADATA_PROVIDER=wikidata`; its default is `none`.
Neither provider is required for manual entry. Suggestions are reviewed before
acceptance; they do not silently overwrite manual metadata. No general AI API key
is consumed by the current implementation. Keep secrets out of `NEXT_PUBLIC_*`,
committed files and shared logs.

## Checks

Run commands sequentially in one checkout so Prisma generation and Next.js builds
do not overwrite each other's outputs:

```sh
pnpm lint
pnpm typecheck
pnpm format:check
pnpm seed:validate
pnpm test --maxWorkers=2
pnpm test:integration
pnpm test:e2e:install
pnpm test:e2e:critical
```

The [testing guide](docs/operations/TESTING.md) maps all suites and prerequisites,
including storage, uploads, public smoke tests, accessibility, mobile, backup and
the production Docker rehearsal. Database/storage/browser runners create disposable
infrastructure; they do not use personal development data. Live OAuth consent,
physical-device coverage and real-server operations have separate evidence limits.
The [Task 24.1 cleanup](docs/operations/CODE_CLEANUP.md) records the latest full
unit/database/critical-browser baseline; dated task reports retain historical counts.

For a local production-mode build, either supply valid production HTTPS auth/storage
configuration or use the isolated browser runners. Development's HTTP MinIO endpoint
is intentionally rejected in production mode; do not bypass this by changing
`NODE_ENV`. `pnpm start` requires an existing `pnpm build` output.

## Database and catalog inputs

Use `pnpm db:deploy` to apply all committed migrations and `pnpm db:status` to check
the ledger. Development startup does not migrate automatically. Generated clients
are ignored and regenerated by development, build and typecheck commands. For a
new reviewed schema change, follow [database migrations](docs/operations/DATABASE.md);
never use `db push` or reset valuable data. Production uses a separate migrator role
and startup service, with a restricted application role.

`pnpm seed:validate` checks the sourced console inputs offline: 4 companies,
5 markets, 19 platforms and 35 hardware entries. It writes no database records.
There is no bulk seed importer; use the administrator catalog UI for catalog entry.
See the [seed format and coverage](prisma/seed-data/README.md).

## Deployment, backup and restore

The [production guide](docs/operations/PRODUCTION_DOCKER.md) describes the existing
single-host Caddy HTTPS, Next.js, PostgreSQL and Garage stack, release updates,
operator commands and diagnostics. It uses separate images, credentials, projects
and six retained volumes. Three Garage replicas on one host do not protect against
host loss. `pnpm test:production` rehearses this stack and encrypted restoration
using disposable resources; it does not deploy a live installation.

[Backup and recovery](docs/operations/BACKUP_RESTORE.md) covers matched database,
object-store, environment and proxy snapshots; verification; the daily Linux timer;
and restoration into fresh volumes. Configure and verify an off-host destination,
keep the encryption key separately, preserve matching release images/configuration,
and rehearse recovery. Backups impose a maintenance window. The timer is a server
template and is not automatically installed or enabled.

Tasks through **24.2 — Documentation** complete the planned repository work.
Production release still requires resolving the recorded vendor findings and
verifying the chosen host's DNS, certificates, real OAuth sign-in, off-host backup
and recovery. No live deployment or production credentials are supplied by this
repository.

## Project documents

- [Design direction and visual reference](DESIGN.md)
- [Application design system](docs/operations/DESIGN_SYSTEM.md)
- [Animation strategy](docs/operations/ANIMATION_STRATEGY.md)
- [UI architecture review](docs/architecture/UI_ARCHITECTURE_REVIEW.md)
- [Authentication architecture review](docs/architecture/AUTH_ARCHITECTURE.md)
- [Authentication security review and remaining advisories](docs/architecture/AUTH_SECURITY_REVIEW.md)
- [Authentication setup and current verification scope](docs/operations/AUTHENTICATION.md)
- [Access grants, first administrator and recovery](docs/operations/ACCESS_GRANTS.md)
- [Server role permissions and grant safeguards](docs/operations/RBAC.md)
- [Core database structures, constraints and migration contracts](docs/operations/CORE_DATABASE.md)
- [Prisma schema review and corrections](docs/architecture/PRISMA_SCHEMA_REVIEW.md)
- [Repository conventions and transaction boundaries](docs/operations/REPOSITORIES.md)
- [Storage architecture and Phase 5 implementation contracts](docs/architecture/STORAGE_ARCHITECTURE.md)
- [Storage service configuration, behavior and verification](docs/operations/STORAGE.md)
- [PostgreSQL search architecture](docs/architecture/SEARCH_ARCHITECTURE.md)
- [Private collection search and migration](docs/operations/SEARCH.md)
- [Command palette, shortcuts and catalog preview](docs/operations/COMMAND_PALETTE.md)
- [Collection filters, URL controls and sorting](docs/operations/FILTERS_AND_SORTING.md)
- [Collection grid/list views, photos and pagination](docs/operations/COLLECTION_VIEWS.md)
- [Console catalog administration](docs/operations/CONSOLE_CATALOG.md)
- [Console seed format, evidence and preservation rules](prisma/seed-data/README.md)
- [3D architecture and provisional performance limits](docs/architecture/3D_ARCHITECTURE.md)
- [Private ModelViewer, controls and supported files](docs/operations/MODEL_VIEWER.md)
- [3D performance evidence and physical-device calibration](docs/performance/3D_PERFORMANCE.md)
- [Game metadata provider architecture and IGDB implementation boundaries](docs/architecture/GAME_METADATA_PROVIDER_ARCHITECTURE.md)
- [IGDB metadata setup, server usage and verification](docs/operations/GAME_METADATA.md)
- [Enrichment workflow, review, provenance and acceptance architecture](docs/architecture/ENRICHMENT_ARCHITECTURE.md)
- [Enrichment service, preview, limits and draft recovery](docs/operations/ENRICHMENT.md)
- [Metadata sources, history retention and media attribution](docs/operations/PROVENANCE.md)
- [Enrichment phase review and corrected findings](docs/architecture/ENRICHMENT_REVIEW.md)
- [Physical packaging/media templates, artwork bindings and owned presence](docs/architecture/PACKAGING_ARCHITECTURE.md)
- [Public collection home and administrator publication review](docs/operations/PUBLIC_HOME.md)
- [Public category browsing, search and filters](docs/operations/PUBLIC_BROWSING.md)
- [Public copy details and contextual media](docs/operations/PUBLIC_DETAILS.md)
- [Public indexing, metadata and sitemap controls](docs/operations/PUBLIC_SEO.md)
- [Public privacy review and adversarial evidence](docs/architecture/PUBLIC_PRIVACY_REVIEW.md)
- [UI foundation and theme handling](docs/operations/UI_FOUNDATION.md)
- [Product specification](PROJECT_SPEC.md)
- [Development plan](DEVELOPMENT_PLAN.md)
- [Architecture review and accepted decisions](docs/architecture/ARCHITECTURE_REVIEW.md)
- [Domain model](docs/architecture/DOMAIN_MODEL.md)
- [Repository architecture](docs/architecture/REPOSITORY_ARCHITECTURE.md)

The repository architecture describes planned paths. Add application files and dependencies only as their development tasks are authorized.

Framework setup follows the official [Next.js installation guide](https://nextjs.org/docs/app/getting-started/installation) and [Tailwind CSS Next.js guide](https://tailwindcss.com/docs/installation/framework-guides/nextjs).
