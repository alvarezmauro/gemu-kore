# Dead code and dependency cleanup

Task 24.1 · 2026-10-23.

The cleanup removes the unused Better Auth generation CLI, nine unused type
aliases and 59 unnecessary exports. Existing helpers remain in their original
modules with their existing callers. Application behavior, routes, permissions,
public projections and database migrations are unchanged.

## Reference review

The review checked TypeScript/JavaScript imports, dynamic imports, exported
declarations, package scripts, build/test configuration, CSS imports and operator
documentation. Candidate declarations were checked across application code,
scripts and tests before changing them. TypeScript's unused-local and
unused-parameter checks supplement that review; they do not independently prove
that an exported declaration is used.

No application module was confirmed unused. Next.js route/layout entry points,
`instrumentation.ts`, `proxy.ts`, ambient declarations, CLI scripts, test fixtures
and the design preview remain. Framework discovery and operational invocation
are valid uses even when a file has no ordinary import. Test-only policy
projections and domain service regressions remain useful coverage. The maintained
shadcn primitives, source artwork, font licenses and immutable migrations remain.

## Removed and narrowed declarations

Removed aliases with no consumers:

- `CatalogHistory` and `ConsoleSeedData` in catalog contracts/seed validation.
- `ConsoleCreate`, `GameCopyCreate`, `GameSave` and `LocationMutation` in form
  validation modules; the underlying runtime schemas remain.
- `SearchInput` and `PublicSearchRow` in private/shared search contracts.
- `Suggestion` in the enrichment repository.

The 59 narrowed exports are declarations referenced only inside their defining
module: DTO mappers, repository selects and row types, schema constituents,
provider helpers, local form types and internal constants. Removing `export`
does not remove their validation, authorization, database queries or runtime
work. Shared contracts and functions actually imported elsewhere retain their
exports. The only component-file changes make `fileRole` and
`TrailerEditorRecord` local; JSX, hooks, loading/error behavior, accessibility,
mobile layout and reduced-motion behavior are unchanged.

Three obsolete code comments now describe the implemented upload/media routes,
public search projection and accessory service split rather than referring to
unfinished earlier tasks. The authentication guide records the CLI removal while
preserving the schema-generation history.

## Dependency review

Removed development dependency `auth` 1.7.7. It was used once to generate the
initial authentication schema. No current source, package script, Docker command
or operational workflow invokes it. Normal migrations use Prisma; future auth
schema changes require an explicitly selected generator and reviewed migration.
The separate `better-auth` runtime and its Prisma adapter remain installed.

The removal prunes 21 installed packages. The lockfile has deletions only; no
retained package version was upgraded or downgraded. Frozen installation succeeds.
Existing compatible security overrides remain because their consuming paths
still exist.

Packages without ordinary application imports were checked before retaining them:

| Package group                                    | Existing use                                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `shadcn`, `tw-animate-css`                       | Imports in `src/app/globals.css`; shadcn also supplies the configured component generator. |
| `@tailwindcss/postcss`, `tailwindcss`, `postcss` | CSS build/plugin pipeline and its compatible peers.                                        |
| `@prisma/client`                                 | Generated Prisma client runtime and adapter peers.                                         |
| `@testing-library/dom`, `jsdom`                  | React Testing Library peers and the configured component-test environment.                 |
| `@types/*`                                       | TypeScript ambient/library declarations.                                                   |
| `tsx`, `typescript`, `prettier`                  | Existing scripts, compilation and formatting commands.                                     |

No dependency-audit tool, new package or permanent analysis framework was added.
This is a conservative repository cleanup, not a claim that static analysis can
prove every possible dynamic use or remove all future maintenance work.

## Verification

| Check                                                     | Result                        |
| --------------------------------------------------------- | ----------------------------- |
| Frozen dependency installation                            | Passed                        |
| Lint and TypeScript                                       | Passed                        |
| Additional unused-local/unused-parameter TypeScript check | Passed                        |
| Unit/component tests                                      | 1,485 passed across 112 files |
| PostgreSQL integration tests                              | 690 passed across 31 files    |
| Critical desktop/mobile browser journeys                  | 54 passed                     |
| Fresh production application build                        | Passed in the browser runner  |
| Console seed validation                                   | Passed; no database writes    |
| Workspace dependency audit                                | Zero known vulnerabilities    |

Reproduce with the existing project commands:

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm exec tsc --noEmit --noUnusedLocals --noUnusedParameters --incremental false
pnpm test --maxWorkers=2
pnpm test:integration
pnpm test:e2e:critical
pnpm seed:validate
pnpm format:check
pnpm audit --json
git diff --check
```

Generation/typechecking, integration tests and the browser runner were sequenced
to avoid competing writes to generated Prisma or Next.js output. The browser
runner builds the production app before running the journeys.

No new tests mirror the export removal. Existing unit/component, database and
browser regressions verify the retained behavior with the smaller dependency
tree. Test data uses disposable infrastructure; personal collection data and
deployment volumes are not changed.

The [final remediation report](../architecture/FINAL_REVIEW_REMEDIATION.md)
continues to own the unresolved production image findings. Removing a development
CLI does not clear those vendor binaries or grant production approval.
Task 24.2 remains the separate, final documentation task.
