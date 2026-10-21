# GemuKore

A web application for managing and showcasing a physical video game collection.

Tasks **1.1–1.4** provide the application and testing foundation. Tasks **2.1–2.4** provide and review the warm-paper design system, responsive UI, themes and motion. Tasks **3.1–3.6** implement, test and review verified OAuth identity, current grants and role permissions. Tasks **4.1–4.3** implement and review the core catalog/collection database and repository boundaries. Tasks **5.1–5.4** add private S3-compatible storage and the authenticated asset upload pipeline: validated images/GLB, preserved originals, image derivatives, provenance/use records, recovery and private streamed reads, with extensive utility and failure regressions. Task **6.1** adds the private [location manager](docs/operations/LOCATIONS.md) at `/app/locations`, with nested places, moves, sibling ordering, breadcrumbs and guarded deletion. Task **6.2** adds private [defect management](docs/operations/DEFECTS.md) at `/app/defects`, with copy-specific records, severity, status and repair details. Task **6.3** adds private [collection photos](docs/operations/COLLECTION_MEDIA.md) at `/app/media`: classifications, captions, authenticated images, mouse/touch ordering, upload progress and a mobile camera picker. The root page remains a temporary design preview; catalog/collection CRUD arrives in its assigned phases. Tasks **7.1–7.2** design and implement [private collection search](docs/operations/SEARCH.md) at `/app/search`, using live catalog relationships, separate physical copies, PostgreSQL text/typo matching and protected serial/note/defect queries. See the [search architecture](docs/architecture/SEARCH_ARCHITECTURE.md). Task **7.3** adds the [command palette](docs/operations/COMMAND_PALETTE.md): ⌘K / Ctrl+K, grouped owned/catalog results, identity previews and existing copy actions. Task **7.4** adds [filters and sorting](docs/operations/FILTERS_AND_SORTING.md) to `/app/search`, with bookmarkable controls, private search text, regional release facts and stable copy ordering. Rating controls follow the planned Phase 11 rating fields. Task **7.5** adds the private [collection browser](docs/operations/COLLECTION_VIEWS.md) at `/app/collection`, with grid/list layouts, private photo previews, URL pagination and a locally saved view choice. Task **8.1** adds the administrator-only [console catalog](docs/operations/CONSOLE_CATALOG.md). Task **8.2** defines the [versioned console seed format](prisma/seed-data/README.md), with a small sourced starter and a read-only validator. Task **8.3** expands the [sourced console seed catalog](prisma/seed-data/CONSOLE_COVERAGE.md) to 19 platforms and 35 representative hardware entries across Nintendo, SEGA, Sony and Microsoft. The files remain inputs for a future import. Task **8.4** adds the private [console creation flow](docs/operations/CONSOLE_CREATION.md) at `/app/consoles/new`, with reviewed catalog selection, physical details, defects, staged photos, copy-specific overrides and safe save recovery. Task **8.5** completes [console copy management](docs/operations/CONSOLE_CRUD.md) with private detail pages, guarded editing/model correction, copy-specific artwork/GLB management and confirmed deletion. Task **9.1** documents the [3D architecture](docs/architecture/3D_ARCHITECTURE.md): a shared viewer loaded on request, private resource ownership, camera/lighting defaults, future packaging/media adapters and provisional mobile budgets. Task **9.2** implements the shared [ModelViewer](docs/operations/MODEL_VIEWER.md) on private console pages: explicit loading, orbit/zoom/touch/keyboard controls, reset/fullscreen, optional rotation, reduced motion and static fallbacks, with bounded private GLB loading and session cleanup. Task **9.3** adds [3D performance checks and evidence](docs/performance/3D_PERFORMANCE.md), clearer loading stages, stable bounded resolution and landscape fitting, static-grid verification and repeated cleanup measurements. iPhone interaction/lifecycle evidence is recorded; extended Safari native-memory retention remains a documented limitation. Physical Android testing is waived by the owner and remains unverified. See [asset upload operations](docs/operations/ASSET_UPLOADS.md).

## Local development

Private game details now include [screenshot galleries](docs/operations/GAME_SCREENSHOTS.md)
and [YouTube/direct-video trailers](docs/operations/GAME_TRAILERS.md), plus sourced
[playtime estimates](docs/operations/GAME_PLAYTIME.md). Apply the Task 11.5/11.6
migrations through the normal database workflow before running the updated application.

Task **12.2** adds optional server-only [IGDB metadata lookup](docs/operations/GAME_METADATA.md),
with sourced results and bounded requests. Setup is optional; enrichment review and its
user interface are implemented in Tasks **13.2–13.5**, with [reviewed suggestions,
guarded acceptance and manual-copy draft recovery](docs/operations/ENRICHMENT.md).

Use Node.js **24.20.0** (also recorded in `.node-version`) and pnpm **11.5.0**. With those installed, run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm docker:up
pnpm db:deploy
pnpm dev
```

Open the local URL printed by Next.js, normally [localhost:3000](http://localhost:3000). If that port is occupied, Next.js chooses another available port. The starter page and public liveness endpoint run without a database. Client generation runs automatically before development, typechecking and builds.

Database operations require `DATABASE_URL`. The current setup has a private `.env.local` with generated credentials; preserve it. For a fresh checkout, copy `.env.example` to `.env.local` before starting Docker. Compose reuses the existing PostgreSQL volume on `127.0.0.1:5433` and runs MinIO on ports 9000/9001. Follow [Docker development](docs/operations/DOCKER_DEVELOPMENT.md) for setup, credentials and the transition from the standalone Task 1.2 database.

To run Next.js inside Docker as well, use `pnpm docker:app` and open [localhost:3002](http://localhost:3002). Source edits are shared, while container dependencies and generated outputs are isolated from the host. Use `pnpm docker:status`, `pnpm docker:logs` and `pnpm docker:down` to manage the services. Database and object data survive teardown in external Docker volumes.

The first MinIO build compiles a pinned upstream source release because its community image is no longer available. Its repository is archived; this local development setup does not settle the production storage choice. Details and source references are in the Docker guide.

Next.js manages `NODE_ENV`; do not override it with custom values. `src/instrumentation.ts` invokes the server-only validator in `src/server/config/env.ts` when the Node.js server initializes. Invalid configuration reports field names without values. Extend the schema and example file together as later tasks introduce integrations. Never use `NEXT_PUBLIC_*` for secrets.

```sh
pnpm db:validate
pnpm db:deploy
pnpm db:status
pnpm db:check
```

Use `pnpm db:migrate --create-only --name describe_the_change` to prepare a future development migration for review. Full migration instructions, pool limits and environment loading are in the database guide. `/api/health` reports application liveness only; database connectivity is checked through the private `db:check` command.

## Console seed inputs

`pnpm seed:validate` checks the small, version-controlled catalog input files in `prisma/seed-data/`. It runs offline without database credentials and makes no database changes. See the [seed format and future application rules](prisma/seed-data/README.md). Bulk catalog data and the database writer are not included in this format task.

## Checks and production build

```sh
pnpm lint
pnpm typecheck
pnpm format:check
pnpm seed:validate
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm test:e2e:access
pnpm build
pnpm start
```

`pnpm typecheck` generates Next.js route types before checking TypeScript, so it works on a fresh checkout without a running development server. `pnpm start` serves the completed production build. Run `pnpm format` to format source and configuration; the existing reviewed architecture documents and logo sources are excluded to preserve their formatting.

Vitest and React Testing Library cover unit/component behavior. Integration tests automatically create and remove an isolated PostgreSQL container; they require Docker and do not use your development data. Before the first browser run, use `pnpm test:e2e:install`. Playwright builds and starts the app on port 3100, then checks desktop/mobile Chromium. See [Testing](docs/operations/TESTING.md) for setup, examples, isolation and failure reports.

Dependencies are pinned in `package.json` and `pnpm-lock.yaml`, including Prisma 7.10.0 rather than the registry's Prisma 8 release candidate. TypeScript 6 and ESLint 9 satisfy the installed Next.js lint plugins' peer ranges; ESLint 9 emits an upstream deprecation notice during initial installation. Revisit that pin when those plugins support ESLint 10. `pnpm-workspace.yaml` holds package-manager settings and explicit installation-script approvals for this single package; it does not introduce extra workspace packages. Next.js automatic agent-file generation is disabled to preserve the maintained `AGENTS.md`.

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
- [UI foundation and theme handling](docs/operations/UI_FOUNDATION.md)
- [Product specification](PROJECT_SPEC.md)
- [Development plan](DEVELOPMENT_PLAN.md)
- [Architecture review and accepted decisions](docs/architecture/ARCHITECTURE_REVIEW.md)
- [Domain model](docs/architecture/DOMAIN_MODEL.md)
- [Repository architecture](docs/architecture/REPOSITORY_ARCHITECTURE.md)

The repository architecture describes planned paths. Add application files and dependencies only as their development tasks are authorized.

Framework setup follows the official [Next.js installation guide](https://nextjs.org/docs/app/getting-started/installation) and [Tailwind CSS Next.js guide](https://tailwindcss.com/docs/installation/framework-guides/nextjs).
