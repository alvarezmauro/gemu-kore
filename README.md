# GemuKore

A web application for managing and showcasing a physical video game collection.

Task **1.1 — Initialize Application** provides the Next.js App Router foundation with TypeScript, Tailwind CSS, ESLint, Prettier and server environment validation. The root page is a temporary starter; product features are not implemented. Next: **1.2 — PostgreSQL + Prisma**.

## Local development

Use Node.js **24.20.0** (also recorded in `.node-version`) and pnpm **11.5.0**. With those installed, run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the local URL printed by Next.js, normally [localhost:3000](http://localhost:3000). If that port is occupied, Next.js chooses another available port. No database, credentials, Docker services or `.env.local` file are needed for Task 1.1.

When configuration is needed, copy `.env.example` to `.env.local`. Next.js manages `NODE_ENV`; do not override it with custom values. `src/instrumentation.ts` invokes the server-only validator in `src/server/config/env.ts` when the Node.js server initializes. Invalid configuration reports field names without values. Extend the schema and example file together as later tasks introduce integrations. Never use `NEXT_PUBLIC_*` for secrets.

## Checks and production build

```sh
pnpm lint
pnpm typecheck
pnpm format:check
pnpm build
pnpm start
```

`pnpm typecheck` generates Next.js route types before checking TypeScript, so it works on a fresh checkout without a running development server. `pnpm start` serves the completed production build. Run `pnpm format` to format source and configuration; the existing reviewed architecture documents and logo sources are excluded to preserve their formatting.

Unit, integration and Playwright test infrastructure belongs to Task 1.4. Task 1.1 is verified through the checks above, browser smoke checks and direct environment-validation checks.

Dependencies are pinned in `package.json` and `pnpm-lock.yaml`. TypeScript 6 and ESLint 9 satisfy the installed Next.js lint plugins' peer ranges; ESLint 9 emits an upstream deprecation notice during initial installation. Revisit that pin when those plugins support ESLint 10. `pnpm-workspace.yaml` holds package-manager settings for this single package, including approval for the lint resolver's native installation step; it does not introduce extra workspace packages. Next.js automatic agent-file generation is disabled to preserve the maintained `AGENTS.md`.

## Project documents

- [Product specification](PROJECT_SPEC.md)
- [Development plan](DEVELOPMENT_PLAN.md)
- [Architecture review and accepted decisions](docs/architecture/ARCHITECTURE_REVIEW.md)
- [Domain model](docs/architecture/DOMAIN_MODEL.md)
- [Repository architecture](docs/architecture/REPOSITORY_ARCHITECTURE.md)

The repository architecture describes planned paths. Add application files and dependencies only as their development tasks are authorized.

Framework setup follows the official [Next.js installation guide](https://nextjs.org/docs/app/getting-started/installation) and [Tailwind CSS Next.js guide](https://tailwindcss.com/docs/installation/framework-guides/nextjs).
