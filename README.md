# GemuKore

A web application for managing and showcasing a physical video game collection.

Tasks **1.1–1.4** provide the application and testing foundation. Tasks **2.1–2.4** provide and review the warm-paper design system, responsive UI, themes and motion. Tasks **3.1–3.4** implement verified Google/GitHub identity, database sessions, current AccessGrant authorization and server-side role permissions, with administrator setup/recovery and guarded grant services. Task **3.5** expands authentication and access regression coverage; Task **3.6** reviews security and hardens error redirects and unused auth endpoints. The root page remains a temporary design preview; catalog/collection features are not implemented. Next: **4.1 — Implement Core Prisma Schema**.

## Local development

Use Node.js **24.20.0** (also recorded in `.node-version`) and pnpm **11.5.0**. With those installed, run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm docker:up
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

## Checks and production build

```sh
pnpm lint
pnpm typecheck
pnpm format:check
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
- [UI foundation and theme handling](docs/operations/UI_FOUNDATION.md)
- [Product specification](PROJECT_SPEC.md)
- [Development plan](DEVELOPMENT_PLAN.md)
- [Architecture review and accepted decisions](docs/architecture/ARCHITECTURE_REVIEW.md)
- [Domain model](docs/architecture/DOMAIN_MODEL.md)
- [Repository architecture](docs/architecture/REPOSITORY_ARCHITECTURE.md)

The repository architecture describes planned paths. Add application files and dependencies only as their development tasks are authorized.

Framework setup follows the official [Next.js installation guide](https://nextjs.org/docs/app/getting-started/installation) and [Tailwind CSS Next.js guide](https://tailwindcss.com/docs/installation/framework-guides/nextjs).
