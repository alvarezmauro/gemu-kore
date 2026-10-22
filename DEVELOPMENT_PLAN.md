# Video Game Collection Manager
## LLM-Orchestrated Development Plan

This document defines the order in which the application should be developed and the preferred OpenAI model for every task.

Task IDs in this document are the execution authority. The roadmap stages in `PROJECT_SPEC.md` are descriptive. Complete only the named task and its applicable checks; do not start another task or unfinished prerequisite without explicit authorization.

Accepted decisions C01–C17 are recorded in [ARCHITECTURE_REVIEW.md](docs/architecture/ARCHITECTURE_REVIEW.md). Task 0.2 writes [DOMAIN_MODEL.md](docs/architecture/DOMAIN_MODEL.md), defining core versus deferred schema scope. Architecture tasks produce documents; they do not authorize application code or migrations.

The goal is not to use the strongest model for everything.

Instead:

- GPT-6 Astra = Architect / Senior Reviewer
- GPT-6 Sol = Primary Engineer
- GPT-6 Luna = Mechanical / High-volume Engineer

---

# 0. Model Strategy

## GPT-6 Astra

Use for:

- architecture
- database/domain design
- security architecture
- complicated refactors
- public/private data boundaries
- 3D architecture
- AI enrichment architecture
- difficult bugs
- final reviews of important phases

Default reasoning:

`High`

Use:

`XHigh`

for especially consequential decisions.

Avoid using Astra for:

- routine CRUD
- simple components
- repetitive tests
- seed-data formatting
- documentation cleanup

---

## GPT-6 Sol

This is the primary development model.

Use for approximately 75–85% of implementation.

Use for:

- Next.js implementation
- Prisma
- PostgreSQL
- Better Auth
- React
- shadcn
- Magic UI
- Motion
- Three.js
- React Three Fiber
- integrations
- forms
- APIs
- server logic
- tests
- Docker
- refactoring
- debugging

Default reasoning:

`High`

Use:

`Medium`

for small or straightforward changes.

---

## GPT-6 Luna

Use for highly constrained work.

Examples:

- expanding tests
- seed data
- repetitive mappings
- documentation
- renaming
- repetitive refactors
- simple validation schemas
- fixture generation
- cleanup

Default reasoning:

`Medium`

Never let Luna make major architectural decisions.

---

# 1. Escalation Rule

When executing tasks:

### If Luna fails:

Move the task to:

`GPT-6 Sol / High`

### If Sol encounters a difficult architectural problem:

Move diagnosis to:

`GPT-6 Astra / High`

Then return implementation to Sol.

### If Sol tries two reasonable approaches and still cannot fix a difficult bug:

Stop iterating with Sol.

Give the entire problem to:

`GPT-6 Astra / High or XHigh`

Once Astra identifies the solution:

return implementation to Sol.

---

# 2. Architectural Rule

For major phases use this pattern:

```text
Astra
↓
Design / Review architecture

Sol
↓
Implement

Luna
↓
Mechanical supporting work

Astra
↓
Review

Sol
↓
Apply review fixes
```

Do not use Astra to write every line of the application.

---

# PHASE 0 — Architecture

This phase should happen before meaningful application development.

## TASK 0.1 — Review the Complete Product Specification

MODEL:

`GPT-6 Astra`

REASONING:

`High`

PURPOSE:

Review the complete product specification and identify architectural risks before implementation.

Prompt:

```text
Read PROJECT_SPEC.md completely.

Do not write application code yet.

Act as the principal software architect for this project.

Review the proposed architecture with special attention to:

- canonical catalog vs owned collection items
- ConsolePlatform vs ConsoleModel
- Game vs GameRelease
- Accessory vs AccessoryVariant
- CollectionItem inheritance/composition
- Region modeling
- Company modeling
- Assets and provenance
- Locations
- Defects
- public/private data boundaries
- physical packaging templates
- physical media templates
- AI enrichment
- future extensibility

Identify:

1. architectural problems
2. missing domain concepts
3. unnecessary complexity
4. relationships likely to cause problems later
5. decisions that should be made before implementation

Then propose the final high-level architecture.

Do not implement anything.
```

OUTPUT:

Architecture review.

Output file: `docs/architecture/ARCHITECTURE_REVIEW.md`. C01–C17 have been resolved with the user; preserve those choices in subsequent design tasks.

---

## TASK 0.2 — Design the Domain Model

MODEL:

`GPT-6 Astra`

REASONING:

`XHigh`

This is one of the most important tasks in the entire project.

Ask Astra to design the conceptual database model.

Include:

```text
User
AccessGrant

Company
Region

ConsolePlatform
ConsoleModel

Game
GameRelease
GameReleaseIncludedItem

Accessory
AccessoryVariant

CollectionItem
OwnedConsole
OwnedGame
OwnedAccessory

Location
Defect

Asset
CollectionItemMedia
CatalogAsset

PackagingTemplate
PackagingTextureSlot

PhysicalMediaTemplate
PhysicalMediaTextureSlot

ExternalReference

EnrichmentRun

AppSettings
PublicSettings
```

Prompt:

```text
Using PROJECT_SPEC.md and the architecture review, design the complete conceptual relational database model.

Do not create Prisma code yet.

For every entity define:

- purpose
- important fields
- relationships
- cardinality
- ownership
- deletion semantics
- important unique constraints
- likely indexes

Pay special attention to avoiding future schema problems.

Also identify which fields should be relational columns versus JSON.

The result should be suitable for implementation in PostgreSQL + Prisma.
```

Output file: `docs/architecture/DOMAIN_MODEL.md`.

Carry forward accepted decisions C01–C17. Define essential asset/publication boundaries, market links, variant compatibility, flat release components, owned presence, explicit target foreign keys and artwork bindings. Define the core Task 4.1 subset versus later feature migrations. Detailed renderer/storage/provider mechanics remain with their feature tasks. Do not generate Prisma or SQL implementation.

---

## TASK 0.3 — Repository Architecture

MODEL:

`GPT-6 Astra`

REASONING:

`High`

Design:

```text
src/
  app/
  components/
  features/
  server/
  lib/

prisma/
tests/
```

Define boundaries between:

```text
UI
Features
Services
Repositories
Prisma
```

OUTPUT:

Repository architecture: [docs/architecture/REPOSITORY_ARCHITECTURE.md](docs/architecture/REPOSITORY_ARCHITECTURE.md).

Reserve `/app/...` for private management and `/collection/...` for consistently public views. Define the private root/dashboard and public item identity conventions without reopening C01.

Task 0.3 documents the planned structure and dependency rules only. Its route convention uses `/app` for the private dashboard and the owned CollectionItem UUID as `[id]` for public item details. Introduce folders, dependencies and configuration only in their assigned implementation tasks.

---

# PHASE 1 — Repository Foundation

## TASK 1.1 — Initialize Application

Status: **Completed 2026-10-02.** See [README.md](README.md) for setup and verification commands. Foundation only; no product features.

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Implement:

- Next.js
- App Router
- TypeScript
- pnpm
- Tailwind
- ESLint
- formatting
- environment validation

Do not implement product features.

DONE WHEN:

```text
pnpm dev
pnpm lint
pnpm typecheck
```

all work.

---

## TASK 1.2 — PostgreSQL + Prisma

Status: **Completed 2026-10-02.** PostgreSQL 16.15, Prisma 7.10.0, migration baseline, server-only database utilities and separate application/database health checks are implemented. Setup and workflow: [docs/operations/DATABASE.md](docs/operations/DATABASE.md). No domain models were introduced.

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Implement:

- PostgreSQL
- Prisma
- local environment
- migration workflow
- DB utilities
- health check

Do NOT implement the complete domain yet.

Use minimal infrastructure models if necessary.

---

## TASK 1.3 — Docker Development Environment

Status: **Completed 2026-10-03.** Compose provides PostgreSQL, MinIO and an optional Next.js app profile, preserving the existing database volume. Both local and containerized development were verified. Setup, persistence and the MinIO source-build limitation are documented in [docs/operations/DOCKER_DEVELOPMENT.md](docs/operations/DOCKER_DEVELOPMENT.md).

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Create:

```text
app
postgres
minio
```

Local development should run with Docker dependencies while allowing Next.js to run locally.

Create:

```text
docker-compose.yml
.env.example
```

---

## TASK 1.4 — Testing Infrastructure

Status: **Completed 2026-10-03.** Vitest, React Testing Library and Playwright are configured with validation, component, isolated PostgreSQL transaction and desktop/mobile browser examples. All 16 checks pass; lint, typechecking, formatting and the production build pass. Setup and isolation are documented in [docs/operations/TESTING.md](docs/operations/TESTING.md).

MODEL:

`GPT-6 Sol`

REASONING:

`Medium`

Configure:

- Vitest
- React Testing Library
- Playwright

Create one example test of each type.

---

# PHASE 2 — UI Foundation

## TASK 2.1 — Install shadcn + Magic UI

Status: **Completed 2026-10-03.** Configured shadcn/ui, the Magic UI registry and Blur Fade source, Lucide, Motion and light/dark/system theme handling. The starter page includes an accessible theme menu. All 23 tests, lint, typechecking, formatting and the production build pass; local and Docker previews were verified. Setup and scope are documented in [docs/operations/UI_FOUNDATION.md](docs/operations/UI_FOUNDATION.md).

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Configure:

- shadcn
- Magic UI
- Lucide
- Motion
- theme handling

Do NOT install other component libraries.

---

## TASK 2.2 — Build Application Design System

Status: **Completed 2026-10-03.** Applied the warm-paper palette and self-hosted typography from `DESIGN.md`, with shared responsive shell/navigation, page headers, cards, form primitives, loading and empty states. The root route is an unsaved design preview. All 31 tests, lint, typechecking, formatting and the production build pass. Usage and scope: [docs/operations/DESIGN_SYSTEM.md](docs/operations/DESIGN_SYSTEM.md). No domain or schema changes.

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Implement:

- typography
- spacing
- page container
- sidebar
- mobile navigation
- page header
- card conventions
- form conventions
- loading states
- empty states
- light theme
- dark theme

Magic UI should be visual enhancement.

shadcn should remain the functional foundation.

---

## TASK 2.3 — Animation Guidelines

Status: **Completed 2026-10-03.** Added shared motion timing, reusable page/card/hover/list/dialog/Blur Fade patterns and a scoped card-to-detail media transition. Reduced motion and visible server-rendered fallbacks are supported. The preview demonstrates unsaved interactions only. All 38 tests, lint, typechecking, formatting and the production build pass. Strategy and usage: [docs/operations/ANIMATION_STRATEGY.md](docs/operations/ANIMATION_STRATEGY.md). No schema changes or new dependencies.

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Create reusable patterns for:

- Blur Fade
- collection cards
- page entry
- dialogs
- list transitions
- card hover
- card → detail transition

Create a documented animation strategy.

Respect:

`prefers-reduced-motion`

---

## TASK 2.4 — UI Architecture Review

Status: **Completed 2026-10-04.** Reviewed server/client boundaries, Magic UI/Motion usage, mobile architecture and design consistency. No Critical/High findings. Fixed two Medium issues (navigation state across the desktop breakpoint and clipped long card metadata) and a Low import-enforcement gap. All 42 tests, lint, typechecking, formatting and the production build pass. Review: [docs/architecture/UI_ARCHITECTURE_REVIEW.md](docs/architecture/UI_ARCHITECTURE_REVIEW.md). No new dependencies or schema changes.

MODEL:

`GPT-6 Astra`

REASONING:

`High`

Review:

- client/server boundaries
- Magic UI usage
- Motion usage
- unnecessary Client Components
- mobile architecture
- design-system consistency

Then:

GPT-6 Sol fixes actionable findings.

---

# PHASE 3 — Authentication & Authorization

## TASK 3.1 — Auth Architecture Review

Status: **Completed 2026-10-04.** [docs/architecture/AUTH_ARCHITECTURE.md](docs/architecture/AUTH_ARCHITECTURE.md) defines verified Google/GitHub identity, disabled account linking, fixed database sessions, current-grant authorization, first-admin bootstrap, revocation and implementation verification gates. Documentation only; Better Auth and AccessGrant implementation remain Tasks 3.2–3.4.

MODEL:

`GPT-6 Astra`

REASONING:

`High`

Design:

```text
OAuth
↓
Better Auth
↓
verified email
↓
AccessGrant
↓
role
↓
server authorization
```

Roles:

```text
ADMIN
EDITOR
VIEWER
```

Make sure OAuth authentication alone cannot grant access.

---

## TASK 3.2 — Implement Better Auth

Status: **Completed 2026-10-04.** Better Auth 1.7.7 provides Google/GitHub verified-email login, guarded first/returning identities, fixed PostgreSQL sessions, logout and safe login/denial routes. The four auth models and migration are applied; private application access remains denied until Task 3.3. Lint, typechecking, formatting, production build, 34 unit/component tests, 30 database integration tests and 38 desktop/mobile browser tests pass. Live provider consent/login requires OAuth credentials, which are not configured locally. Setup and verification boundaries are documented in [docs/operations/AUTHENTICATION.md](docs/operations/AUTHENTICATION.md).

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Implement:

- Google OAuth
- GitHub OAuth
- sessions
- required database models

---

## TASK 3.3 — Implement AccessGrant

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Implement authorization based on verified OAuth email.

Reject users not contained in:

`AccessGrant`

Status: **Completed 2026-10-04.** Added the application-owned grant schema/migration, current verified-email grant checks, server-only access context, transactional revalidation and explicit administrator bootstrap/recovery commands. Missing, disabled or deleted grants deny private access; role changes affect existing sessions on the next check. Lint, typechecking, formatting, schema validation, production build, 43 unit/component tests, 57 isolated database integration tests and 50 desktop/mobile browser tests pass. The migration is applied and Docker preview verified. No real administrator was provisioned without its exact verified email. Role permission policy and ordinary grant administration remain Task 3.4. Setup and recovery: [docs/operations/ACCESS_GRANTS.md](docs/operations/ACCESS_GRANTS.md).

---

## TASK 3.4 — Implement RBAC

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Implement:

```text
ADMIN
EDITOR
VIEWER
```

Permissions must be server-side.

Editors manage copies and generate enrichment suggestions; only admins create/edit canonical catalog records or accept canonical changes. Publication and settings changes require ADMIN. Enforce permissions at the underlying service, including inline catalog creation.

Status: **Completed 2026-10-04.** Added the explicit role-permission matrix, a server-only guard that reloads current session/grant authority, and guarded grant list/create/update/delete services. Grant mutations require a session created within five minutes, serialize with bootstrap/recovery, and cannot remove the final enabled ADMIN. Direct-service tests cover role escalation, revoked/stale identity, fresh-login requirements, strict inputs, inline canonical denial/rollback and concurrent administrator changes. Lint, typechecking, formatting, production build, 72 unit/component tests, 110 isolated database integration tests and 50 desktop/mobile browser tests pass. No new dependency, migration or future domain functionality. Grant-management UI/transport is not exposed yet. Policy and usage: [docs/operations/RBAC.md](docs/operations/RBAC.md).

---

## TASK 3.5 — Authentication Tests

MODEL:

`GPT-6 Luna`

REASONING:

`Medium`

Expand tests for:

- authorized email
- unauthorized email
- disabled access
- different roles
- normalization

Do not change production auth architecture.

Status: **Completed 2026-10-04.** Added 44 regression cases covering normalized verified-email grants provisioned before Google/GitHub login, every role, absent/disabled grants, alias separation, malformed/unverified identity, policy changes across established OAuth sessions, independent browser identities, session expiry/revocation, tampered cookies and disabled-user signout. Changes are limited to tests, disposable fixtures and documentation. Production auth architecture, dependencies and migrations are unchanged. Lint, typechecking, formatting, production build, 82 unit/component tests, 130 isolated database integration tests and 64 desktop/mobile browser tests pass (276 total). Disposable test containers were removed; personal development data was not used. Live provider consent requires actual OAuth credentials. Coverage and boundaries: [docs/operations/TESTING.md](docs/operations/TESTING.md#task-35-authentication-regression-coverage).

---

## TASK 3.6 — Security Review

MODEL:

`GPT-6 Astra`

REASONING:

`XHigh`

Review:

- OAuth
- sessions
- role escalation
- AccessGrant
- server actions
- protected routes
- auth bypass possibilities

GPT-6 Sol implements fixes.

Status: **Completed 2026-10-04.** Reviewed the implemented OAuth, session, current-grant, role/service, route and operator boundaries; no authentication or role-escalation bypass was identified. Reproduced and fixed provider error detail in login redirects, added no-referrer auth responses, and disabled four unused session mutation endpoints. Seven new integration regressions fail before the fixes and pass afterward. Updated optional mysql2 to 3.23.1 and ensured repeated installs recheck lockfile/override changes. Lint, typechecking, formatting, diff whitespace checks, production build, 82 unit/component tests, 137 isolated database integration tests and 64 desktop/mobile browser tests pass (283 total). The refreshed Docker app is healthy; login/design preview and anonymous private redirects pass browser verification. Two high upstream tooling advisories (deepmerge-ts and braces) remain explicitly documented with no current request-input path identified; production rate limiting and live OAuth consent still need deployment/provider configuration. No schema migration or future domain implementation. Findings, evidence and follow-up: [docs/architecture/AUTH_SECURITY_REVIEW.md](docs/architecture/AUTH_SECURITY_REVIEW.md).

---

# PHASE 4 — Core Database

## TASK 4.1 — Implement Core Prisma Schema

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Take the approved Astra conceptual schema and implement it in Prisma.

Do NOT redesign the domain.

Include the core catalog + collection models.

Create the agreed core catalog and collection structures for consoles, games and accessories using the Task 0.2 core-scope list. Do not pre-create all optional enrichment, packaging or rendering tables. Later domain tasks use these structures rather than redesigning them.

Status: **Completed 2026-10-04.** Implemented the approved 25 core models alongside the existing five auth/policy models: catalog identities, explicit market/compatibility/company links, identifiers/references, all three owned subtypes, locations/defects, settings and immutable metadata history. Added an atomic additive migration with restrictive shared references, private/default-disabled publication, scoped partial uniqueness, calendar/target/JSON checks and deferred matching-subtype enforcement. UUID default annotations now match PostgreSQL introspection without altering existing auth tables. Forty new isolated database cases verify migration replay/redeployment/drift and core invariants; all 82 unit/component, 177 integration and 64 desktop/mobile browser tests pass (323 total). Lint, typechecking, formatting, schema validation, production builds and whitespace checks pass. Migration is applied locally, status/drift/connectivity are healthy, Docker's refreshed client includes all 30 models, and login/private redirects/design preview pass browser verification. No catalog/inventory seeds, CRUD endpoints, UI features, new dependency, optional asset/component/enrichment tables or rendering fields. Schema contracts and deferred service obligations: [docs/operations/CORE_DATABASE.md](docs/operations/CORE_DATABASE.md). Task 4.2 remains the next independent review before major features.

---

## TASK 4.2 — Review Prisma Schema

MODEL:

`GPT-6 Astra`

REASONING:

`XHigh`

This review happens before building major features.

Check:

- relationships
- indexes
- uniqueness
- cascading deletes
- nullable properties
- join tables
- JSON usage
- future extensibility

If Astra recommends schema changes:

implement them now.

Do not postpone major schema problems.

Status: **Completed 2026-10-04.** Reviewed relationships, FK index coverage, uniqueness/NULL semantics, deletion behavior, nullable fields, association tables, JSON and staged extensibility against the approved domain model. Reproduced six owned-root ID changes that bypassed deferred subtype checks, four nullable required-list cases and missing chronological history indexes. An additive migration makes copy IDs immutable, validates required flat string lists and adds the eight approved history access indexes; the unused future OwnedGame component candidate key was removed. Retained the composite subtype keys after Prisma validation confirmed their necessity. All 82 unit/component, 189 isolated integration and 64 desktop/mobile browser tests pass (335 total), including 12 new database cases; lint, typechecking, formatting, schema validation, production builds and whitespace checks pass. Local migration status, drift and connectivity are healthy. The refreshed Docker app generates all 30 models and passes login, private-redirect and home browser verification. Applied migration history is preserved; no new dependency, application endpoint, domain CRUD or future feature. Findings and service boundaries: [docs/architecture/PRISMA_SCHEMA_REVIEW.md](docs/architecture/PRISMA_SCHEMA_REVIEW.md). Next: Task 4.3.

---

## TASK 4.3 — Create Base Repositories

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Create repository conventions.

Do not make one enormous generic repository.

Status: **Completed 2026-10-04.** Added small server-only catalog and collection identity repositories covering all three product/copy splits, with explicit nested selects, retained archive state, nullable missing results and caller-supplied transaction reads. Preserved the existing access repository and switched its role type to the server-local generated client. Documented query/input/DTO/error conventions, service-owned transactions and authorization, future pagination and separate public projections. ESLint now enforces repository markers, downward imports and transaction ownership, and blocks service UI/request/database-client imports. Eighteen new boundary cases and nine real PostgreSQL repository cases cover missing/wrong-kind IDs, narrow records, all subtypes, archives, transaction visibility and rollback. All 100 unit/component, 198 isolated integration and 64 desktop/mobile browser tests pass (362 total), plus lint, typechecking, formatting, production builds and whitespace checks. The existing local login/private redirect/home pass browser verification and all disposable databases were removed. A nonfailing pg adapter deprecation warning is traced and documented without suppression or dependency changes. No schema/migration, domain CRUD, new endpoint, UI change or future storage feature. Conventions and limits: [docs/operations/REPOSITORIES.md](docs/operations/REPOSITORIES.md). Next: Task 5.1.

---

# PHASE 5 — Assets & Object Storage

## TASK 5.1 — Storage Architecture

MODEL:

`GPT-6 Astra`

REASONING:

`High`

Review abstraction for:

```text
MinIO
Cloudflare R2
DigitalOcean Spaces
Backblaze
AWS S3
```

The application must not depend directly on one provider.

Honor the privacy contracts from Task 0.2: private originals, explicit media-use approval, approved public display versions and authorized direct file access. MVP model ingestion accepts self-contained GLB only.

Status: **Completed 2026-10-04.** Reviewed MinIO, Cloudflare R2, DigitalOcean Spaces, Backblaze B2 and AWS S3 against the accepted asset, provenance and privacy model. Documented one server-only S3-compatible adapter, four byte operations, logical immutable locators, private buckets, authorized streaming, bounded upload/retry lifecycles, derivative lineage, safe reference-aware cleanup and provider migration/restore. Defined provider configuration differences and implementation acceptance checks; cloud compatibility still requires testing with the pinned adapter and chosen account. Documentation links, formatting and diff whitespace checks pass. No application code, schema, dependency, configuration, bucket or publication change; implementation suites were not rerun for this design task. Architecture and handoff: [docs/architecture/STORAGE_ARCHITECTURE.md](docs/architecture/STORAGE_ARCHITECTURE.md). Next: Task 5.2.

---

## TASK 5.2 — Implement Storage Service

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Implement:

- S3-compatible adapter
- upload
- delete
- signed URLs if needed
- metadata
- object keys

Status: **Completed 2026-10-04.** Implemented one server-only S3-compatible adapter with generated immutable locators, technical metadata, replayable/hash-checked uploads, streamed reads/ranges, confirmed missing-key metadata and idempotent current-object deletion. Added optional all-or-none storage configuration, explicit path-style addressing, bounded retries/deadlines, cancellation and redacted failures; SDK imports are confined by lint rules. Reproduced and fixed MinIO's ambiguous HEAD 404 for missing buckets versus keys. Pinned @aws-sdk/client-s3 3.1146.0. All 145 unit/component, 32 isolated storage, 198 PostgreSQL integration and 64 desktop/mobile browser tests pass (439 total), with lint, serialized typechecking, formatting, production browser builds and whitespace checks. The refreshed Docker app is healthy and preview/login/private redirects pass browser verification. Existing pg deprecation and two previously reviewed tooling advisories remain documented; no new audit advisory. No schema, Asset records, media endpoint, content-decoding pipeline, signed URL API, public bucket or development-data mutation. Usage, tests and handoff: [docs/operations/STORAGE.md](docs/operations/STORAGE.md). Next: Task 5.3.

---

## TASK 5.3 — Asset Upload Pipeline

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Implement:

- MIME validation
- file size validation
- generated object keys
- image metadata
- Asset records

Status: **Completed 2026-10-04.** Added the approved Asset/dependency/catalog/item/application-use models through additive migrations, preserving independent content-safety and rights reviews. Implemented authenticated same-origin uploads, actual MIME/size/resource validation, immutable generated keys, exact original retention, oriented metadata-free WebP derivatives, bounded self-contained GLB validation, atomic READY/use finalization, hash-verified idempotent completion, private no-store GET/HEAD/ranges and explicit reference-aware cleanup/retries. Pinned Sharp and the official Khronos validator with documented processing/hosting limits. All 154 unit/component, 25 isolated full asset-pipeline, 32 storage, 198 PostgreSQL and 66 desktop/mobile browser tests pass (475 total), with lint, typechecking, formatting, production builds and whitespace checks. Local migrations, connectivity and schema drift checks pass; the refreshed Docker app, preview and private-login redirect pass browser verification. The empty development bucket was provisioned privately; unsigned access is denied and the Linux decoder is ready. No personal test records/files, public delivery, upload form, viewer, background queue, automatic cleanup or future-phase feature. Known pg deprecation and the two previously reviewed tooling advisories remain; new dependencies add no reported advisory. Contract, limits and recovery: [docs/operations/ASSET_UPLOADS.md](docs/operations/ASSET_UPLOADS.md). Next: Task 5.4.

---

## TASK 5.4 — Asset Utility Tests

MODEL:

`GPT-6 Luna`

REASONING:

`Medium`

Add extensive tests for:

- MIME validation
- filenames
- object keys
- metadata normalization

Status: **Completed 2026-10-04.** Added 240 unit utility cases covering supported/forged MIME types and actual decoding, filename decoding/NFC/basename/length/control boundaries, canonical opaque keys and UUID/namespace isolation, strict metadata envelopes/checksums/numeric bounds, technical-only object headers, image resizing/transparency and all eight EXIF rotations/mirrors checked by pixel positions. Strengthened the APNG fixture with valid CRCs and an independent decoder check; generated compact real fixtures avoid network downloads and large raw photos. The tests exposed an inherited-property MIME allowlist bug; changed it to Object.hasOwn and added three authenticated 400/no-reservation regressions plus a private filename persistence/header regression. All 394 unit/component, 29 isolated asset-pipeline, 32 storage, 198 PostgreSQL and 66 desktop/mobile browser tests pass (719 total), with lint, typechecking, formatting, production builds and whitespace checks. Disposable databases and buckets are removed. No schema/migration, dependency, new endpoint, UI, development-data/storage-policy change or future phase implementation. Existing documented pg deprecation and tooling advisories are unchanged. Coverage and boundaries: [docs/operations/ASSET_UPLOADS.md](docs/operations/ASSET_UPLOADS.md#task-54-utility-regression-coverage). Next: Task 6.1.

---

# PHASE 6 — Shared Collection Infrastructure

## TASK 6.1 — Locations

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Implement hierarchical:

`Location`

including:

- CRUD
- nesting
- moving
- breadcrumb display

Example:

```text
Home
/ Office
/ Retro Cabinet
/ Shelf 2
```

Status: **Completed 2026-10-04.** Added the private `/app/locations` manager and a link from the private entry page. Viewers can browse; editors and administrators can add, edit, nest, move, reorder and delete unused locations through authenticated, validated Server Actions. The service serializes hierarchy writes, rejects cycles/concurrent cross-moves and duplicate names, preserves descendant/item IDs, derives current breadcrumbs, blocks occupied/parent deletion and rejects stale edits. Responsive themed controls, accessible dialogs/confirmation, pending/error feedback and retained form values use the existing design system. All 416 unit/component, 226 PostgreSQL integration and 82 desktop/mobile browser tests pass (724 checks), with lint, types, formatting, production browser builds and whitespace validation. No schema/migration, dependency, development-data or future-phase change. Details: [docs/operations/LOCATIONS.md](docs/operations/LOCATIONS.md). Next: Task 6.2.

---

## TASK 6.2 — Defects

MODEL:

`GPT-6 Sol`

REASONING:

`Medium`

Implement:

- severity
- status
- title
- description
- collection relationship

Status: **Completed 2026-10-05.** Added the private `/app/defects` manager for existing owned consoles, games and accessories, with separate records per copy, severity/status labels, description/repair notes, repair-date handling, active versus unresolved counts and confirmed deletion. Server Actions verify identity and current collection permission; the collection service validates copy-scoped IDs, serializes same-copy changes with a root row lock, rechecks waiting actors, rejects stale aggregate revisions, advances revision/actor atomically and resets publication approval when defects contribute to the public projection. No defects recorded is distinct from inspected/defect-free. All 439 unit/component, 267 PostgreSQL and 98 desktop/mobile browser cases pass (804 checks), plus lint, types, formatting, production browser builds and whitespace validation. No schema/migration, dependency, development fixture or future-phase implementation. Details: [docs/operations/DEFECTS.md](docs/operations/DEFECTS.md). Next: Task 6.3.

---

## TASK 6.3 — Collection Media

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Implement:

- photos
- media classification
- drag/drop ordering
- upload progress
- mobile photo upload

Status: **Completed 2026-10-13.** Added private collection photos at `/app/media` for existing owned consoles, games and accessories: all eleven classifications, captions/image descriptions, private thumbnails and full-image viewing, confirmed removal, mouse/touch drag ordering and keyboard reorder buttons. Sequential library/camera uploads show actual transfer progress separately from processing and expose explicit completion recovery without blind reupload. Copy-scoped actions and upload attachment revalidate current access, lock the owned root, preserve aggregate revisions and reject stale changes; changed approved uses require fresh review, with publication reset when personal photos contribute to public output. Originals, shared assets and provenance survive detachment. All 488 unit/component, 298 PostgreSQL, 30 asset-pipeline, 32 storage and 118 desktop/mobile browser cases pass (1,066 checks), plus lint, types, formatting, production browser builds and whitespace validation. The authenticated browser runner uses disposable private MinIO behind trusted test-only TLS. No dependency, schema/migration, personal-data fixture or future-phase feature. Details: [docs/operations/COLLECTION_MEDIA.md](docs/operations/COLLECTION_MEDIA.md). Next: Task 7.1.

---

# PHASE 7 — Search / Filtering / Collection Views

## TASK 7.1 — Search Architecture

MODEL:

`GPT-6 Astra`

REASONING:

`High`

Design PostgreSQL search using:

- full-text search
- pg_trgm
- indexed fields

Avoid external search infrastructure.

Status: **Completed 2026-10-13.** Defined live PostgreSQL full-text/prefix/trigram search across owned identity relationships, with one result per physical copy, cross-field AND matching, deterministic relevance, bounded pagination and a query-driven expression-index inventory. Private and public matching/projection are separate; hidden fields cannot affect public results, rankings, counts or suggestions, and public serial search stays excluded. Private free text travels in a read-only POST body to avoid placing serial/note queries in URLs. Documented text-array alias indexing, source/normalization limits, current-access/cache/transaction boundaries and the Task 7.2 acceptance plan. Nineteen isolated SQL design checks pass on PostgreSQL 16.15; selective FTS and trigram statements choose GIN indexes on 10,006 synthetic rows without forcing the planner. Formatting, internal links and documentation-only scope pass. No application code, migrations, production database objects, dependencies or UI changes. Details: [docs/architecture/SEARCH_ARCHITECTURE.md](docs/architecture/SEARCH_ARCHITECTURE.md). Next: Task 7.2.

---

## TASK 7.2 — Implement Search

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Implement global collection search.

Search:

- consoles
- games
- accessories
- model names
- manufacturers
- publishers
- editions

- serial numbers
- notes
- defects

Status: **Completed 2026-10-13.** Added private global collection search at `/app/search` with one result per physical copy across live console, game and accessory identities. PostgreSQL full-text, prefix and bounded trigram matching cover names/aliases, companies and credits, editions, platforms, commercial markets, identifiers, serials, notes and defects/repair notes. Cross-field AND, deterministic relevance and bounded paging preserve copy isolation; cards use narrow projections and existing exact-copy photo/defect links. Read-only POST keeps private free text out of URLs; current access, strict input/body limits, transaction-local timeouts, cancellation and accessible mobile/error states are enforced. The additive UTF-8/pg_trgm migration adds 18 expression indexes and is applied to local development. All 516 unit/component, 346 PostgreSQL and 134 desktop/mobile browser cases pass (996 checks), with lint, types, formatting, production browser builds and whitespace validation. Complete-query plans on 3,004 owned copies verify selective GIN use and common-word/short-prefix execution within the configured timeout. Reserved public SQL is separately tested without exposing a public endpoint. No dependency, personal fixture, command palette, filter/sort or future collection-view UI. Details: [docs/operations/SEARCH.md](docs/operations/SEARCH.md). Next: Task 7.3.

---

## TASK 7.3 — Command Palette

MODEL:

`GPT-6 Sol`

REASONING:

`Medium`

Implement:

`⌘K / Ctrl+K`

using shadcn Command.

Status: **Completed 2026-10-15.** Added private Quick search with ⌘K / Ctrl+K and visible desktop/mobile triggers, using shadcn Command adapted to the existing Radix Dialog and pinned `cmdk` 1.1.1. Results group owned Consoles, Games and Accessories separately from typed canonical Catalog identities; previews retain copy/catalog boundaries and offer existing exact-copy photo/defect actions without fabricating future detail routes. A private, strict POST endpoint reads both scopes under current permissions in one repeatable-read snapshot, reusing PostgreSQL indexes and resource/privacy limits. Shared request handling cancels obsolete work and clears private input/results on dismissal. Focus trapping/restoration, Escape/outside dismissal, arrow/Enter navigation, open-modal safeguards, subtle reduced-motion-aware results and 320px layouts are verified. All 527 unit/component, 361 PostgreSQL and 152 desktop/mobile browser cases pass (1,040 checks), plus lint, types, formatting, production browser builds and whitespace validation. Catalog plan/index checks extend the 3,004-copy fixture. Local Docker app refreshed and healthy on port 3002. No schema/migration, personal fixtures, public palette, catalog CRUD or filter/view implementation. Details: [docs/operations/COMMAND_PALETTE.md](docs/operations/COMMAND_PALETTE.md). Next: Task 7.4.

---

## TASK 7.4 — Filters and Sorting

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Implement URL-based filtering.

Example:

```text
/app/games?platform=snes&region=us&hasBox=true
```

Status: **Completed 2026-10-15.** Added bookmarkable filters and sorting to the existing private `/app/search` workspace, with shared contracts for later category pages. Controls cover owned type, platform, model manufacturer/model, release publisher/edition, accessory producer, commercial market, truthful release year, nested/unassigned location, box true/false/unknown and unresolved defects. Fixed sorts include relevance, name, added date, release year, location, platform and publisher, with stable copy UUID ties and unknowns last where relevant. Native URL history restores controls across reload/Back/Forward while private free text remains in POST bodies and survives control changes within the page session. Parameterized PostgreSQL applies controls before complete matching, copy deduplication and bounded paging; current access, narrow private projections, cancellation, invalid/stale selections and accessible desktop/mobile layouts are verified. All 558 unit/component, 393 PostgreSQL and 168 desktop/mobile browser cases pass (1,119 checks), plus lint, types, formatting, production browser builds, documentation links and whitespace validation. Filtered plans extend the existing 3,004-copy fixture within the statement timeout. Ratings are explicitly deferred to the approved Phase 11 rating fields; no premature rating schema, category CRUD, grid/list/pagination UI, public filter endpoint, migration, dependency or personal fixture is added. Local Docker app is healthy on port 3002 and the anonymous filtered endpoint rejects access. Details: [docs/operations/FILTERS_AND_SORTING.md](docs/operations/FILTERS_AND_SORTING.md). Next: Task 7.5.

---

## TASK 7.5 — Grid/List Views

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Implement:

- grid
- list
- pagination
- user preference

Collection grids should use Magic UI carefully.

Status: **Completed 2026-10-15.** Added the private collection browser at `/app/collection`, linked from the workspace and command palette, with responsive grid/list layouts, a locally saved view choice, owned-copy cards and private photo previews. Both layouts preserve identity, available metadata, unknown observations, unresolved-defect semantics and existing exact-copy photo/defect actions; missing or failed images have honest fallbacks. A restrained Magic Card spotlight is limited to fine-pointer grid use without reduced motion. URL pagination uses 20-copy pages and the existing bounded offsets, with stable ordering, complete filtering before paging, resets on filter/sort/private-text changes, Back/Forward/reload support, keyboard focus, static loading skeletons and empty-page recovery. Search text remains in POST bodies; browser storage contains only grid/list. A strict private collection endpoint reuses current access and transaction limits, loading card summaries in one batch after paging; original/serial-only images, storage details and private text excerpts remain outside cards. A diagnosed JIT compilation timeout is fixed transaction-locally without increasing the two-second deadline or changing global database configuration. All 583 unit/component, 400 PostgreSQL and 188 desktop/mobile browser cases pass (1,171 checks), plus lint, types, formatting, production browser builds, documentation links and whitespace validation. The 3,004-copy fixture now includes card hydration; real private photo upload/read and 320px dark/reduced-motion layouts are verified. No dependency, migration, schema, personal fixture, public collection endpoint or future category CRUD is introduced. Details: [docs/operations/COLLECTION_VIEWS.md](docs/operations/COLLECTION_VIEWS.md). Next: Task 8.1.

---

# PHASE 8 — Consoles

## TASK 8.1 — Console Catalog

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Implement:

```text
Company
ConsolePlatform
ConsoleModel
Region
ExternalReference
```

Core entities already established in Task 4.1 are reused here. Implement feature services, validation, catalog management and only the approved feature-specific schema additions; do not recreate or independently redesign core tables.

Status: **Completed 2026-10-17.** Reused Game and GameRelease with separate administrator catalog lists/forms at `/app/catalog/games`, server validation, bounded lookups (including same-title slug disambiguation), repositories/services, transactional manual history, revision conflict handling, and soft archive/restore. Supports developers, release editions/printings, languages, partial market dates, scoped company credits, region locking, external references, and a flat expected-content list. Added GameReleaseIncludedItem and its CatalogAsset target with database quantity/target/primary constraints; retained component IDs survive edits. No owned-copy CRUD, providers, templates, completeness, screenshots, trailers, or playtime features were added. Checks passed: lint, typecheck, Prisma validation, changed-file formatting, production build, 766 unit/component tests, 75 targeted PostgreSQL integration tests, six game-catalog Playwright cases and 12 console-catalog regression cases across desktop/mobile Chromium. Reviewed release-form and narrow dark/reduced-motion screenshots. Migration tested only on disposable databases; apply through the normal deployment workflow. Documentation: [Game catalog](docs/operations/GAME_CATALOG.md). Next: Task 11.2, only when requested.

Status: **Completed 2026-10-15.** Added the administrator-only console catalog at `/app/catalog`, linked from the private home page, reusing Company, Region, ConsolePlatform, ConsoleModel and ExternalReference. Create/edit forms cover canonical facts, aliases, years, measurements, versioned specifications, independent model manufacturer/market/region-lock data and explicit-target provider references. Active relationship searches, bounded stable pagination, immutable manual field history and archive/restore preserve existing identities and owned copies. Strict server validation, current permission checks before/after a transaction-scoped catalog write lock, revision conflicts and atomic history/reference/market writes prevent unauthorized or lost changes. Forms retain failed entries, guard pending submissions and support keyboard focus, dark themes, reduced motion and 320px layouts. All 623 unit/component, 415 PostgreSQL and 200 desktop/mobile browser cases pass (1,238 checks), with lint, typechecking, formatting, production browser builds and whitespace validation. The 144 existing authenticated browser cases pass in the full regression run; all 12 new catalog cases pass after correcting two test selectors. Local Docker app is healthy on port 3002 and the new route redirects anonymous visitors to login. No dependency, schema/migration, personal fixture, seed/import data, owned-console CRUD, catalog asset editor, public endpoint or future-phase implementation. Details: [docs/operations/CONSOLE_CATALOG.md](docs/operations/CONSOLE_CATALOG.md). Next: Task 8.2.

---

## TASK 8.2 — Initial Console Seed Format

MODEL:

`GPT-6 Sol`

REASONING:

`Medium`

Create clean seed structure.

Do not populate hundreds of consoles yet.

Status: **Completed 2026-10-15.** Established version-1 JSON inputs under `prisma/seed-data/companies`, `regions` and `consoles`, with immutable namespaced seed keys, explicit company/platform/market relationships, typed optional facts, versioned specifications, exact measurement strings and record-level source evidence. A small officially sourced Sony/Japan/PlayStation/SCPH-1000 starter exercises the format without expanding the catalog. Added `pnpm seed:validate`: a bounded read-only offline checker that validates all four files together, duplicate identities, unresolved links, market/locking distinctions, references and provenance. Documented future insert-only idempotence, collision review, SEED history, current administrator authorization and preservation of manual edits; no database applicator or automatic seed hook is introduced. All 66 new seed-format/tooling checks and the full 689 unit/component tests pass, with typechecking, lint, formatting, documentation links and whitespace checks. Repeated CLI runs from a different working directory with deliberately invalid database configuration preserve input hashes and produce the same counts. No dependency, schema/migration, UI/persistence behavior, live database data or future catalog expansion is changed; database/browser suites are not applicable to this format-only task. Format, source evidence and authoring rules: [prisma/seed-data/README.md](prisma/seed-data/README.md). Next: Task 8.3.

---

## TASK 8.3 — Expand Console Seed Data

MODEL:

`GPT-6 Luna`

REASONING:

`Medium`

Once the seed format is established, Luna can add systems such as:

```text
NES
SNES
N64
GameCube
Wii
Switch

Master System
Genesis
Saturn
Dreamcast

PlayStation
PS2
PS3
PS4
PS5

Xbox
Xbox 360
Xbox One
Xbox Series
```

Do NOT let Luna change the schema.

Status: **Completed 2026-10-15.** Expanded the existing version-1 files to 4 companies, 5 commercial markets, all 19 listed console platforms and 35 representative physical hardware entries, with official source URLs, check dates and explicit evidence limits. Preserved every Task 8.2 starter key and fact. Regional ecosystem names remain aliases; physical designs and model series remain distinct, incomplete hardware identities without fabricated model codes, manufacturers, locking, measurements or lifecycle dates. Updated the existing checks to validate all committed facts against the catalog input contract and added planned-platform/source coverage. The read-only validator, all 690 unit/component tests, typechecking, lint, formatting, documentation links and whitespace checks pass. No schema, dependency, application behavior, database writer or live catalog data changes; database and browser suites are not applicable to this data-only expansion. Coverage and curation decisions: [prisma/seed-data/CONSOLE_COVERAGE.md](prisma/seed-data/CONSOLE_COVERAGE.md). Next: Task 8.4.

---

## TASK 8.4 — Console Creation Flow

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Build:

```text
Select console
↓
Select model
↓
Physical information
↓
Photos
↓
Overrides
↓
Review
↓
Save
```

Status: **Completed 2026-10-15.** Added `/app/consoles/new` for administrators/editors, linked from the private entry and collection browser. The six-step flow provides paged active console/model search, sole-model selection, canonical identity preview, private physical details, separate initial defects, local photo/camera staging, copy-only logo/GLB overrides and a review before saving. Services validate current permissions, model/platform membership and reviewed revisions under the existing catalog/location locks; root, subtype and defects save atomically and privately. A stable in-memory copy reference deduplicates concurrent or uncertain retries. Files upload afterward through the existing private pipeline, with progress, explicit completion recovery and no copy recreation on failure; override activation cannot replace another primary selection or change approved public uses. All 704 unit/component, 428 PostgreSQL, 168 authenticated desktop/mobile and 44 general browser cases pass (1,344 distinct checks), with lint, types, formatting, production builds, seed validation, documentation links and whitespace checks. The full authenticated regression run passed its 156 existing cases; a final creation-only run passed all 12 new cases after keyboard-focus and selector corrections. No schema/migration, dependency, seed import, existing-console CRUD/detail page or 3D renderer is added. Temporary test services were removed; the local development app remains healthy and no personal catalog fixtures were created. Usage, scope and recovery: [docs/operations/CONSOLE_CREATION.md](docs/operations/CONSOLE_CREATION.md). Next: Task 8.5.

---

## TASK 8.5 — Console CRUD

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Implement:

- create
- read
- update
- delete

for OwnedConsole.

Status: **Completed 2026-10-15.** Reused creation from Task 8.4 and added private `/app/consoles/[id]` detail pages, linked from collection grid/list, search, the owned-console palette preview and saved-copy receipt. The page separates catalog facts, commercial markets/history/specifications, private physical details, personal/catalog galleries and defects. Administrators/editors can edit shared copies, explicitly correct model identification, manage custom logo/GLB selections and confirm deletion; viewers retain read access. Services enforce strict input, current grants, catalog membership/revisions, location validity and the shared copy revision under ordered locks. Open forms and confirmations retain their reviewed revision, reject concurrent changes and keep drafts; archived current identities can remain. Meaningful edits/override changes return published copies to Private, while normalized no-ops preserve revision/publication. Deletion atomically removes only the selected root/subtype, defects and media links, preserving canonical data, other copies, stored files and provenance. Existing private uploads/recovery and authenticated delivery are reused; logo derivatives show source filenames, long labels wrap, and selection remains explicit after upload. Verified 709 unit/component, 444 PostgreSQL, 180 authenticated desktop/mobile and 44 general browser cases (1,377 distinct checks), plus lint, types, formatting, production builds, seed validation, documentation links and whitespace checks. Full regression runs passed the 168 existing authenticated cases and 443 database cases; final focused runs passed all 12 new console browser journeys and 29 console database cases, including the additional filename regression. No schema/migration, dependency, seed import, public endpoint or 3D renderer. Disposable services were cleaned up; personal development data was not populated and the local app remains healthy. Details: [docs/operations/CONSOLE_CRUD.md](docs/operations/CONSOLE_CRUD.md). Next: Task 9.1.

---

# PHASE 9 — 3D Foundation

## TASK 9.1 — 3D Architecture

MODEL:

`GPT-6 Astra`

REASONING:

`XHigh`

Design reusable R3F architecture for:

- console GLBs
- packaging templates
- cartridge templates
- textures
- lighting
- camera presets
- loading
- mobile
- performance

Do not implement everything yet.

Status: **Completed 2026-10-15.** Documented [docs/architecture/3D_ARCHITECTURE.md](docs/architecture/3D_ARCHITECTURE.md), grounded in the current GLB validation, private streaming, console model resolution and accepted component/template domain. Defines one optional R3F/Drei viewer, a server-selected presentation contract, explicit activation and lazy client runtime, per-session loading/resource cleanup without a shared private model cache, static fallbacks, camera/lighting conventions, keyboard/touch/fullscreen/reduced-motion behavior and mobile rendering limits separate from upload acceptance. Packaging and physical-media templates keep separate domain identities and explicit revisioned artwork slots/bindings while sharing the viewer stage. Public 3D requires independently approved DISPLAY geometry/textures and context-scoped current-policy delivery; existing ORIGINAL GLBs remain private. Numerical budgets are provisional engineering choices, with physical-phone calibration explicitly required in Task 9.3 rather than claimed as measured. Reviewed against official Next.js, R3F, Drei, Three.js and Khronos documentation. Verified documentation formatting, referenced repository paths/local links and diff whitespace; runtime suites are not applicable to documentation-only changes. No application code, schema/migration, dependency, asset/data mutation, viewer implementation or benchmark. Next: Task 9.2.

---

## TASK 9.2 — ModelViewer

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Implement:

`<ModelViewer />`

using:

- Three.js
- React Three Fiber
- Drei

Features:

- orbit
- zoom
- touch
- reset
- fullscreen
- auto rotate
- responsive rendering
- image fallback

Status: **Completed 2026-10-16.** Implemented the shared private `<ModelViewer />` with pinned Three.js/R3F/Drei dependencies, a lazy client runtime and a compact host on existing console pages. Added fresh server-authorized presentation reads, shared copy → model → platform selection, bounded private GLB transfer/preflight, fitted camera/studio lighting, orbit/zoom/touch/keyboard controls, reset, native fullscreen/dialog fallback, optional rotation, live reduced motion, static fallback, cancellation and session-owned resource cleanup. Embedded textures and repeated ImageBitmap disposal are exercised in the real browser. Documented [ModelViewer operations](docs/operations/MODEL_VIEWER.md). Verified lint, typecheck, formatting, production builds, 749 unit/component tests, 447 PostgreSQL tests and 240 desktop/mobile browser checks (194 full private regressions, two additional texture cases and 44 general UI checks). Stabilized an existing upload-recovery component test by waiting for its button to become enabled. Refreshed the local Docker app dependencies and checked health/private redirection. No schema, catalog/collection data, public delivery, template renderer or Phase 10 hero redesign changes. Physical-phone budget calibration remains Task 9.3. Next: Task 9.3.

---

## TASK 9.3 — 3D Performance

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Implement:

- lazy loading
- dynamic imports
- static grid thumbnails
- cleanup/disposal
- optimized loading states

Status: **Completed 2026-10-16, with a documented Safari native-memory limitation and owner-waived Android testing.** Preserved lazy loading and static collection thumbnails; added early budget rejection, accessible loading phases, visibility pauses, stable bounded resolution and corrected landscape fitting. Released temporary reflection-bake geometry/materials, instanced buffers and scratch targets immediately, retaining only the baked reflection until close. The textured browser study now holds four live GPU buffers instead of 32. Verified lint, typecheck, formatting, production build, 752 unit/component cases and 48 focused console/viewer/performance browser cases; earlier task checks include 32 console PostgreSQL and 44 general UI cases. [Performance evidence](docs/performance/3D_PERFORMANCE.md) records physical iPhone interaction for all three synthetic studies, rotation/idle, visibility, user-confirmed landscape/flicker fixes, live reduced motion and controlled loading/cancel/retry. Extended reopening records graphics/bitmap disposal, but Safari native-memory retention remains inconclusive; the same context-quota warning pair reproduces in plain WebGL. This is an explicit limitation, not a native-memory pass or universal mobile guarantee. The owner explicitly waived physical Android testing on 2026-10-16; compatibility is assumed from iOS, not verified. Admission ceilings remain conservative/provisional. The isolated phone environment was cleaned up. No dependency, domain/schema, collection-data, public-delivery or Phase 10 change. Next: Task 10.1.

---

# PHASE 10 — Console Detail UX

## TASK 10.1 — Console Detail Page

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Build premium console page.

Hero:

- 3D model
- logo
- name
- model
- manufacturer
- generation
- year

Sections:

```text
My Console
Console Information
Technical Specifications
Gallery
```

Status: **Completed 2026-10-17.** Reorganized the private console detail page into a responsive media/identity hero with the existing on-demand 3D viewer, selected logo, platform/model identity, separately labeled manufacturers, generation and release years. Added section navigation and distinct My Console, Console Information, Technical Specifications and Gallery sections, keeping canonical markets separate from observed markings and catalog imagery separate from personal photos. Preserved copy editing/deletion, defects, media management, private authorization and unknown/empty/error fallbacks. Fixed stale-edit error focus to run after rendering and after the pending fieldset is enabled, with component/browser coverage. Verified lint, typecheck, formatting, production browser builds, 752 unit/component cases, 32 console PostgreSQL cases and all 48 focused console/viewer/performance browser scenarios across the full run and corrective reruns; inspected desktop, active-viewer and 320px dark/reduced-motion screenshots. The stable-buffer stress test allows slower software WebGL damping to settle while retaining zero idle draws and zero resolution writes. No dependency, schema/migration, public endpoint or Task 10.2 animation polish added. Details: [Console detail operations](docs/operations/CONSOLE_DETAIL.md). Next: Task 10.2.

---

## TASK 10.2 — Magic UI Polish

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Use:

- Magic Card
- Blur Fade
- subtle Grid/Retro Grid
- Motion transitions

Avoid visual overload.

Status: **Completed 2026-10-17.** Added the existing Magic Card fine-mouse spotlight to the console identity panel, a single bounded Blur Fade on the platform/model summary, a faint static theme-aware corner grid, and a scoped Motion selection indicator on native section links. Hash selection supports keyboard activation, Back/Forward and direct-link reloads without shifting link widths. Touch and reduced-motion users retain a static presentation; server-rendered content and fragment links work without JavaScript. Fixed shared Blur Fade cleanup to complete at the static end state instead of rewinding internal Motion values, with a reduced-motion CSS safeguard and browser coverage for toggling back to normal motion. Verified lint, types, formatting, production builds, all 752 unit/component cases across full/focused reruns, 32 console PostgreSQL cases, 32 console/viewer browser scenarios across full/focused runs and six shared motion browser cases. Inspected light desktop and 320px dark/reduced-motion screenshots. Resource-sensitive unit timeouts and an initial test-selector mismatch were resolved through focused reruns without changing unrelated application behavior or test assertions. No dependency, schema/migration, query, authorization, public-delivery or automatic 3D-loading change. Details: [Console detail polish](docs/operations/CONSOLE_DETAIL.md#task-102--restrained-presentation-polish). Next: Task 10.3.

---

## TASK 10.3 — Consoles Phase Review

MODEL:

`GPT-6 Astra`

REASONING:

`High`

Review:

- schema
- CRUD
- queries
- UI architecture
- R3F usage
- performance
- future Games compatibility

GPT-6 Sol fixes issues.

Status: **Completed 2026-10-17.** Reviewed application commit `4d535bd` across console schema/invariants, canonical versus owned identity, transactional CRUD, authorization/revision/lock handling, queries and private DTOs, Server/Client Component boundaries, R3F admission/loading/lifecycle/performance, and future Games compatibility. No Critical, High or new justified Medium defect requires correction. Recorded one Low/nonblocking observation: detail reads reuse the full location-management projection with unused counts; a narrower label/path query is a measurement-driven follow-up, not a current scaling failure. Preserved the accepted owner-waived Android testing and inconclusive Safari native-memory limits without treating them as passed checks. Fresh checks: lint, typecheck, document formatting, schema validation, 76 targeted unit/component cases, 84 console/core-schema PostgreSQL cases and the existing renderer bundle budget pass. Prior browser/build/phone evidence is clearly distinguished from fresh review checks. No production code, dependency, schema or migration changes were necessary. Report: [Consoles phase review](docs/architecture/CONSOLES_PHASE_REVIEW.md). Next: Task 11.1, only when requested.

---

# PHASE 11 — Games

## TASK 11.1 — Game Domain Implementation

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Implement:

```text
Game
GameRelease
GameReleaseIncludedItem
```

Remember:

Game ≠ GameRelease.

Core entities already established in Task 4.1 are reused here. Implement feature services, validation, catalog management and only the approved feature-specific schema additions; do not recreate or independently redesign core tables.

---

## TASK 11.2 — Game Creation Flow

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Flow:

```text
Platform
↓
Game
↓
Optional market/edition filters
↓
Release selection
↓
My Copy
↓
Review
```

Deliver a complete manual creation flow now. The selected release fixes canonical market and edition. Admins may create a missing release; editors select existing records. Add optional enrichment during Phases 12–13, available during creation and afterward; saving a valid copy must not depend on providers.

Status: **Completed 2026-10-17.** Added `/app/games/new` with platform and title searches, optional commercial-market/edition filters, release selection, copy details/structured defects/personal photos, and review before saving. Administrators can explicitly create a missing shared release using the existing catalog editor and select it without losing copy details; editors select existing records. The selected release fixes canonical market/edition and exposes expected contents separately from actual copy presence. Server-side creation validates strict inputs, active relationships and revisions, location and current authorization under the shared locks; it atomically creates a private CollectionItem, OwnedGame and initial defects, with idempotent concurrent/repeated-save handling. Photos use the existing private upload/recovery pipeline after the copy commits. Added collection entry links and reused copy validation, form and picker primitives. No dependencies, schema migration, provider/enrichment work, or Task 11.3 editing/deletion/detail controls were added. Verification: lint, typecheck, changed-file formatting, 775 unit/component tests, 51 targeted game-creation/game-catalog/console PostgreSQL tests and 26 desktop/mobile Chromium browser checks pass, including production build, admin release creation, stale-draft recovery and uncertain uploads. Reviewed desktop light and 320px dark/reduced-motion screenshots. Documentation: [Game creation](docs/operations/GAME_CREATION.md). Next: Task 11.3, only when requested.

---

## TASK 11.3 — Game CRUD

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Implement full OwnedGame CRUD.

Status: **Completed 2026-10-19.** Added private `/app/games/[id]` viewing with catalog cover fallback, title/platform/release identity, scoped company credits, partial market dates, expected contents, personal copy fields, bounded photo/defect previews and existing management links. Editors/admins can edit copy observations, explicitly correct the selected release using active paged catalog choices and optional market/edition filters, or confirm deletion. Canonical data remains separate; current archived identities can be retained, fresh archived choices are rejected, stale copy/catalog revisions preserve drafts, no-op saves retain publication, and meaningful edits return published copies to Private. Transactions recheck permission after catalog/location/copy locks; deletion locks associated assets and cascades only copy dependents, retaining catalog records, other copies, stored files and provenance. Added exact-copy links from creation, collection views, search and command palette. Reused a shared confirmation primitive with console regression coverage. No schema, migration, dependency, screenshots, trailers, playtime, enrichment or component-presence changes. Checks passed: lint, typecheck, changed-file formatting, production build, 788 unit/component cases, 55 targeted game-CRUD/game-creation/console PostgreSQL cases and 30 distinct desktop/mobile Chromium scenarios. The initial browser run passed 29 cases; a mobile creation test needed to open navigation before following the collection link, and the corrected scenario passed on both projects. Reviewed desktop light and 320px dark/reduced-motion screenshots. Documentation: [Game CRUD](docs/operations/GAME_CRUD.md). Next: Task 11.4, only when requested.

---

## TASK 11.4 — Screenshots

MODEL:

`GPT-6 Sol`

REASONING:

`Medium`

Implement galleries and source metadata.

Status: **Completed 2026-10-19.** Added a paginated private screenshot gallery on game details, with explicit game-level fallback, contained images, keyboard previous/next viewing, focus restoration, source attribution and safe source/license links. Administrators can upload screenshots for a selected release, edit captions/image descriptions, reorder uses, and confirm removal through `/app/catalog/games/screenshots`; editors/viewers remain read-only. Reused CatalogAsset SCREENSHOT roles and existing Asset provenance instead of a duplicate GameScreenshot table. Validated UTF-8 source metadata is recorded with the original/display family, without granting rights/public approval or overwriting shared provenance. Completion retries attach and advance release history exactly once. Mutations enforce server permissions, archived-target/revision checks and catalog/asset locking; caption/order changes reset use approval and removal retains stored files, lineage, other uses and owned copies. Controls remain disabled until refreshed revisions arrive, preventing an immediate save/reorder race found during browser verification. No schema, migration, dependency, provider, trailer, playtime or component-presence changes. Checks pass: lint, typecheck, changed-file formatting, production build, 800 unit/component cases, 25 targeted screenshot/game-CRUD/game-catalog PostgreSQL cases, 31 PostgreSQL/MinIO asset cases, and six screenshot plus six game-CRUD desktop/mobile Chromium scenarios. Reviewed desktop gallery and 320px dark/reduced-motion viewer screenshots. Documentation: [Game screenshots](docs/operations/GAME_SCREENSHOTS.md). Next: Task 11.5, only when requested.

---

## TASK 11.5 — Trailer Player

MODEL:

`GPT-6 Sol`

REASONING:

`Medium`

Support:

- YouTube
- direct video

Never arbitrary iframe HTML.

Status: **Completed 2026-10-19.** Added structured YouTube/direct-HTTPS trailer groups on Game and GameRelease, with provider-specific database checks, game-default/release-override display and explicit scope labels on private copy details. Administrators manage references through the catalog or copy detail links; strict server validation, current-role rechecks after the shared catalog lock, archived/stale-record rejection, revision increments and atomic manual history protect changes. Replacements/removals clear trailer public approval; no-op saves preserve it, and owned-copy fields/publication remain separate. The player module and external media load only on request, with fixed privacy-enhanced YouTube embeds, origin-only iframe referrers, native direct-video controls, no autoplay, unload-on-close and external source fallbacks. Explicit provider labels, error focus, retained stale drafts and narrow dark/reduced-motion layouts are verified. Added migration `20261019120000_game_trailers`; tested only on disposable databases. No dependency, provider import, enrichment, uploaded-video ingestion, public route or playtime feature. Checks pass: lint, typecheck, changed-file formatting, Prisma validation, production builds, 818 unit/component cases (two workers), 94 distinct targeted PostgreSQL cases, six trailer and six game-CRUD desktop/mobile Chromium scenarios. Initial browser checks found and fixed an implicit provider-label issue; error-state test selectors were narrowed to exclude the framework route announcer, and all six trailer cases pass on the final run. Native playback uses an actual generated WebM; YouTube requests use a deterministic fixture, so live provider availability is not claimed. Documentation: [Game trailers](docs/operations/GAME_TRAILERS.md). Next: Task 11.6, only when requested.

---

## TASK 11.6 — Playtime

MODEL:

`GPT-6 Sol`

REASONING:

`Medium`

Support:

- main story
- main + extras
- completionist
- source metadata

Store one selected estimate set with source, optional URL and recorded/updated timestamp. Permit clearly identified manual estimates and unknown durations; imported replacements require review. Follow Task 0.2 for game-versus-release scope.

Status: **Completed 2026-10-19.** Added GamePlaytime with nullable nonnegative integer minutes, shared manual/external source metadata, recorded/created/updated timestamps, unique Game/GameRelease foreign keys and exactly-one-target database checks. Private game details select a whole release override or game default, label the scope, preserve all-unknown override sets, and display zero distinctly from unknown. Administrators manage estimates through saved catalog/copy links, compare the current/proposed complete set, and explicitly confirm replacement or removal; external source values require the same reviewed acceptance. Server validation, current-role rechecks after the catalog guard, archived/stale checks, root revisions and atomic manual history protect changes without modifying copy observations or publication. No-op edits preserve row IDs and update timestamps; unchanged recorded dates preserve full existing timestamp precision. Stale drafts survive failures and Reload saved estimates, allowing a new comparison before retrying. Mobile review/detail layouts, source links, error focus and reduced motion are verified; the narrow dialog heading reserves space for its close button. Added migration `20261019140000_game_playtime`, tested only on disposable databases. No dependencies, external requests, provider import, enrichment or public queries. Checks pass: lint, typecheck, changed-file formatting, Prisma validation, production builds, 841 unit/component cases with two workers, 98 distinct targeted PostgreSQL cases, and six playtime plus six game-CRUD desktop/mobile Chromium scenarios. The cascade fixture was corrected to satisfy existing expected-content deletion restrictions; all nine playtime integration cases pass on recheck. Reviewed desktop light, 320px dark/reduced-motion detail and final review screenshots. Documentation: [Game playtime](docs/operations/GAME_PLAYTIME.md). Next: Task 12.1, only when requested.

---

# PHASE 12 — External Game Metadata

## TASK 12.1 — Provider Architecture

MODEL:

`GPT-6 Astra`

REASONING:

`High`

Design:

```text
GameMetadataProvider
```

so IGDB does not leak throughout application code.

Status: **Completed 2026-10-19 (design only).** Documented the server-only GameMetadataProvider boundary, typed search/fetch envelopes, normalized evidence and partial-result semantics, external identity namespaces, local relationship resolution and Game-versus-physical-release safeguards. Defined sourced ratings/playtime mappings, optional credentials, bounded transport, cancellation/retry/error behavior and the Phase 13 review/provenance/acceptance handoff. Checked provider constraints against official IGDB/Twitch documentation. No application code, dependency, configuration, migration, endpoint or enrichment UI was added. Documentation formatting, local-link/fence checks and patch-integrity checks pass; runtime suites are not applicable to this documentation-only task. Documentation: [Game metadata provider architecture](docs/architecture/GAME_METADATA_PROVIDER_ARCHITECTURE.md). Next: Task 12.2, only when requested.

---

## TASK 12.2 — IGDB Integration

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Implement provider:

- search
- game retrieval
- release information
- images
- companies
- videos
- ratings

Normalize external responses into internal DTOs.

Status: **Completed 2026-10-19.** Implemented the server-only IGDB adapter and explicit provider composition point with runtime-validated neutral search/fetch contracts, external identity namespaces, sourced evidence, partial-result states and bounded diagnostics. Search supports escaped terms, validated platform/year filters and query-bound pagination; retrieval normalizes game identity, platform/market/date observations, company roles, image candidates, structured YouTube references, separate rating groups and sampled playtime estimates. Broad evidence never establishes physical-edition identity or local UUIDs. Added optional credentials validated on capability use, process-local token reuse/single-flight acquisition, independent caller cancellation, deadlines, request/body/output budgets, throttling/cooldowns, bounded retries and sanitized errors. ESLint enforces provider/service boundaries. No dependency, database migration, catalog mutation, media download, enrichment endpoint or UI was added. Checks pass: lint, typecheck, changed-file formatting, production builds, 899 unit/component cases with two workers, and 18 desktop/mobile Chromium startup/auth/liveness scenarios with metadata credentials disabled. Provider coverage uses deterministic invented fixtures; live IGDB connectivity and aggregate multi-instance quotas are not claimed. No persistence behavior changed, so database integration suites were not rerun for this adapter-only task. Documentation: [Game metadata integration](docs/operations/GAME_METADATA.md). Next: Task 12.3, only when requested.

---

## TASK 12.3 — Provider Mapping Tests

MODEL:

`GPT-6 Luna`

REASONING:

`Medium`

Create extensive fixture-based tests.

Do not alter provider architecture.

Status: **Completed 2026-10-19.** Added 181 fixture-based regressions covering identity types and related games, partial calendar dates/leap years, current versus deprecated mappings, commercial markets, release/company scope, duplicate or mismatched IDs, incomplete arrays, media identifiers, rating kinds/scales/counts, playtime units/zeros/samples and source timestamps/URLs. Added scripted public-adapter cases for token failures, Retry-After/cooldown behavior, refresh/retry budgets, optional-endpoint failures, cancellation, private/unexpected input fields, escaped Unicode queries, forged pagination, redirects, malformed response envelopes and actual streamed byte limits. Normalized-output checks exercise evidence links, release scope, privacy and the output-size ceiling. Corrected an existing test table to pass array response envelopes intact. Provider suites now contain 222 passing cases; the full unit/component suite passes 1,080 cases across 61 files with two workers. Lint, typecheck, changed-file formatting, documentation links and patch checks pass. Tests use invented version-controlled fixtures and injected transport; no live credentials/network, provider architecture, runtime code, configuration, dependency, migration or application UI change. Build, database and browser suites were not rerun for this test-only task. Documentation: [fixture guide](tests/fixtures/game-metadata/README.md) and [metadata verification](docs/operations/GAME_METADATA.md). Next: Task 13.1, only when requested.

---

# PHASE 13 — AI Enrichment

## TASK 13.1 — Enrichment Architecture

MODEL:

`GPT-6 Astra`

REASONING:

`XHigh`

Design:

```text
structured providers
       ↓
normalization
       ↓
AI/web enrichment
       ↓
candidate suggestions
       ↓
review
       ↓
accepted changes
```

Cover:

- provenance
- confidence
- conflicts
- incomplete information
- retry behavior
- EnrichmentRun

Use explicit target foreign keys with exactly one populated target. Separate editor-generated proposals from admin acceptance. Add enrichment to the existing manual game flow without making it a prerequisite for saving.

Status: **Completed 2026-10-19 (design only).** Documented the structured-provider → optional grounded web/AI → frozen suggestions → review → accepted-change workflow against the implemented provider and catalog boundaries. Defined explicit run targets, current editor/admin permissions, immutable request intent and source snapshots, candidate/field selection, confidence semantics, missing/conflicting data, bounded execution, retry leases/generations and recovery. Specified revision-checked idempotent atomic acceptance, manual-replacement acknowledgements, whole-group updates, source lineage and private media/publication safeguards. Recorded current rating-storage and image-ingestion prerequisites with explicit ineligible capabilities, preserving manual game saving throughout. Assigned service, preview, provenance and review work to Tasks 13.2–13.5 without adding runtime code, configuration, migrations, dependencies or UI. Documentation formatting, local-link/fence, whitespace, patch-integrity and documentation-only scope checks pass; runtime suites are not applicable to this design-only task. Documentation: [Enrichment architecture](docs/architecture/ENRICHMENT_ARCHITECTURE.md). Next: Task 13.2, only when requested.

---

## TASK 13.2 — Enrichment Service

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Implement the architecture approved by Astra.

Status: **Completed 2026-10-19.** Added persisted, bounded enrichment runs and immutable field proposals with explicit canonical targets and unique accepted-history links. Implemented private structured-provider search/fetch, candidate and field selection, developer bindings, freeze/reject/apply, idempotency, quotas, cancellation, retry generations and lease recovery. Acceptance rechecks current administrator permissions, target/dependency revisions and manual-value acknowledgements, then commits one root revision with the selected catalog groups, provider provenance, final decisions and a repeatable receipt atomically. Rating/image acceptance and optional web/AI stages report their missing prerequisites; broad Game evidence cannot rewrite physical release metadata. Manual saving remains independent. Added authenticated server actions and an [operations guide](docs/operations/ENRICHMENT.md); preview controls remain Task 13.3. Verification: schema validation, lint, typecheck, 1,084 unit/component cases, 20 enrichment integration cases plus 36 catalog/playtime/trailer/manual-creation regressions, and 18 desktop/mobile production-build browser checks pass. Migrations were exercised only on disposable PostgreSQL. Next: Task 13.3, only when requested.

---

## TASK 13.3 — Enrichment Preview UI

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Show:

```text
Current value
Suggested value
Source
Confidence
```

Actions:

```text
Apply
Ignore
Apply selected
Apply all
```

Status: **Completed 2026-10-19.** Added the private enrichment review page with explicit provider-match and field/trailer/developer choices, readable current/suggested values, safe source links, unavailable confidence/capability explanations, manual-value acknowledgements, per-field/selected/all application and ignore controls, retained review links for administrator handoff, and retry/cancel/status/stale-result recovery. Editors can prepare their own reviews; current server authorization remains authoritative for all reads and writes. Optional entries in the add-game flow and saved-copy details open a separate tab, preserving copy drafts and photo files. Added a server-validated refresh of the same canonical platform/game/release and a mandatory return through copy review after refresh; no automatic copy submission or retargeting. Updated the [operations guide](docs/operations/ENRICHMENT.md#preview-workflow). Verification: lint, typecheck, formatting, 1,092 unit/component cases, 33 enrichment/manual-creation integration cases, and all 12 authenticated desktop/mobile browser cases pass, including 320px dark/reduced-motion layouts, keyboard ignore, ownership denial, administrator acceptance, stale save rejection and preserved photo upload. Inspected desktop/mobile screenshots. No new dependencies, migrations, live-provider test calls or public enrichment endpoint. Next: Task 13.4, only when requested.

---

## TASK 13.4 — Provenance

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Persist where imported metadata came from.

Never silently overwrite manual information.

Status: **Completed 2026-10-19.** Added private game/release source displays and administrator history attribution using retained immutable change snapshots, with explicit manual, imported, seeded, AI-assisted and unknown origins. Source projections expose safe links, retrieval/update dates, supported transformations and unavailable confidence without exposing enrichment queries, tokens, actors or raw snapshots. Per-field lookups verify current values against recorded changes independently of the history display window; legacy untracked corrections require manual-replacement acknowledgement during review and acceptance. Unified cover, personal-photo and screenshot attribution while preserving publication and rights checks. Added [provenance operations documentation](docs/operations/PROVENANCE.md). Verification: lint, typecheck, formatting, 1,104 unit/component cases, 55 provenance/enrichment/catalog integration cases and 18 authenticated desktop/mobile browser cases pass, with focused final regression runs and screenshot inspection. Tests use disposable databases/storage and deterministic provider fixtures. No new dependencies, migrations, live-provider calls or public endpoint. Next: Task 13.5, only when requested.

---

## TASK 13.5 — Enrichment Review

MODEL:

`GPT-6 Astra`

REASONING:

`High`

Look for:

- hallucination pathways
- accidental overwrites
- bad merging
- provider coupling
- missing provenance
- inconsistent releases

Status: **Completed 2026-10-19.** Audited retrieval, candidate/field selection, frozen proposals, acceptance, provenance, private/public separation and the optional manual-copy flow against the approved architecture. Corrected two medium findings: conflicting candidate/trailer identities now fail runtime validation, and incomplete/invalid retained evidence is explained before selection and acceptance. Added regressions for ambiguous adapter results, preserved manual group entries, complete playtime replacement, concurrent idempotent acceptance and changed release-parent dependencies. No remaining blocking finding identified for the current structured-provider scope. The [review report](docs/architecture/ENRICHMENT_REVIEW.md) records evidence, corrections and intentionally unavailable AI/web, image-ingestion, rating and public-source capabilities. Verification: lint, typecheck, formatting, 1,112 unit/component cases, 73 disposable-PostgreSQL integration cases, 16 authenticated desktop/mobile browser cases and a final focused enrichment rerun pass; screenshots inspected. The full unit suite uses two workers after default-concurrency ESLint initialization timeouts, without relaxing test timeouts or skipping cases. No new dependencies, migrations, live-provider calls or public endpoint. Next: Task 14.1, only when requested.

---

# PHASE 14 — Physical Game 3D

## TASK 14.1 — Packaging Architecture

MODEL:

`GPT-6 Astra`

REASONING:

`XHigh`

Finalize:

```text
PackagingTemplate
PackagingTextureSlot
PhysicalMediaTemplate
PhysicalMediaTextureSlot
```

Example:

```text
SNES Box Geometry
+
front.png
back.png
spine.png
↓
Chrono Trigger SNES Box
```

Use the flat expected release-component and owned-presence contracts from Task 0.2. Define explicit component/slot/asset bindings for both packaging and physical media. Support multiple independently illustrated packages/discs without a nested containment hierarchy. Finalize implementation mechanics, not a new product model.

Status: **Completed 2026-10-19 (design only).** Finalized the four separate template/slot contracts and dedicated component artwork bindings, composite same-template/same-release constraints, immutable READY revisions, draft/archived behavior, explicit reassignment and retained provenance. Defined owned presence, primary-package migration/reconciliation and the atomic hasBox summary, preserving existing manual answers before activation. Specified all six procedural faces, authored GLB index/material/UV targets, units/orientation, explicit crop/contain, prepared WebP artwork, isolated resources, bounded assembled presentation/loading and private/public gates. Recorded required upload/reference-check extensions, first-format curation and the staged Tasks 14.2–14.6 handoff without adding runtime implementation. Documentation: [Packaging architecture](docs/architecture/PACKAGING_ARCHITECTURE.md). Verification: approved-document/current-code consistency, official upstream references, six face normals/artwork axes checked against installed Three.js 0.186.1, local links/fences, formatting, whitespace and documentation-only scope pass. Runtime suites are not applicable to this design-only task. No schema, assets, dependencies, environment or application behavior changed. Next: Task 14.2, only when requested.

---

## TASK 14.2 — 3D Box Renderer

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Implement reusable box renderer.

Start with one format.

For example:

SNES.


Status: **Completed 2026-10-19.** Added the first private procedural SNES cardboard box renderer with six explicit faces, immutable ready template revisions, measured/synthetic dimension provenance, administrator artwork uploads and crop/rotation bindings, and expected-component previews on owned game details. Reuses the lazy viewer, camera, keyboard/touch/fullscreen controls and reduced-motion behavior; preserves manual `hasBox` and keeps presence/primary-package/public presentation inactive. Artwork admission, transfer/decode budgets, isolated resources, cancellation and cleanup references are enforced. Documentation: [Private packaging preview](docs/operations/PACKAGING_PREVIEW.md). Verification: lint, typecheck, schema validation, production build, deferred bundle budget, formatting/whitespace, 1,121 unit/component tests, 4 packaging integration tests, 52 core-schema tests, 31 asset-pipeline tests and 18 desktop/mobile packaging/console viewer tests pass. The broader integration suite has one existing search-plan benchmark timeout (PostgreSQL 57014, two-second statement limit), reproduced on unchanged baseline `2984960` with its original schema; 101 other search tests pass. No search code or timeout policy was changed. Migration is included and replay-tested on disposable databases; the personal development database was not migrated. Next: Task 14.3, only when requested.

---

## TASK 14.3 — Add Packaging Formats

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Add:

- NES
- SNES
- Genesis
- PlayStation
- PS2
- Switch

Do them incrementally.


Status: **Completed 2026-10-20 — all six packaging formats implemented incrementally.** NES/SNES retain their explicit six-face cardboard renderer and compatible older descriptors. Genesis adds authored clamshell geometry, a dedicated private upload attached directly to draft templates, explicit front/back/spine primitive mappings, source/measurement evidence and validation of stored bytes before readiness. Ready geometry and mappings are immutable and protected from asset cleanup. Private previews reuse the lazy viewer and proportional artwork composition with aggregate model/image budgets. Original synthetic fixtures model rounded shells, rims, seam, hinges and clasp without supplying retail catalog measurements. Manual `hasBox`, expected-component semantics and private authorization are preserved. Documentation: [Genesis authoring](docs/operations/GENESIS_PACKAGING_AUTHORING.md) and [packaging operations](docs/operations/PACKAGING_PREVIEW.md). PlayStation jewel cases now extend the authored path with bounded clear housing and a fourth, optional-art opposite spine; see [jewel authoring](docs/operations/PLAYSTATION_JEWEL_AUTHORING.md). PS2 DVD cases now reuse the opaque authored three-surface contract with reviewed keep-case geometry; see [DVD authoring](docs/operations/PS2_DVD_AUTHORING.md). Switch now completes the format list with reviewed slim clear-case housing and three required art mappings; see [Switch authoring](docs/operations/SWITCH_CASE_AUTHORING.md). Task 14.4 — Cartridge Renderer is next and has not started.

Genesis verification: 1,150 unit/component tests, 6 packaging + 52 core-schema + 8 game-catalog integration checks, 35 upload checks and 22 desktop/mobile packaging/console-viewer checks pass, plus lint, typecheck, schema validation, production build, deferred bundle budget, formatting/whitespace and fixture generation. Full unit tests use two workers with unchanged timeouts; detailed evidence and the existing broader search benchmark limitation are recorded in the authoring guide. Migration `20261020120000_genesis_authored_packaging` is replay-tested on disposable PostgreSQL; the personal development database is not migrated.

PlayStation verification: 1,160 unit/component tests, 8 packaging + 52 core-schema + 8 game-catalog integration checks, 37 upload checks and 24 distinct desktop/mobile packaging/console-viewer checks pass, including a focused rerun after one database-client generation/fixture conflict. Lint, typecheck, schema validation, production build, fixture generation, formatting/whitespace and deferred bundle budget pass (1,010,935 raw / 270,614 gzip bytes). Migration `20261020130000_playstation_jewel_packaging` is replay-tested on disposable databases; the personal development database is unchanged. Detailed verification and limits are in the jewel authoring guide.

PS2 verification: 1,167 unit/component tests, 9 packaging + 52 core-schema + 8 game-catalog integration checks, 39 upload checks and all 26 desktop/mobile packaging/console-viewer checks pass. Lint, typecheck, schema validation, production build, fixture generation, documentation links, formatting/whitespace and deferred bundle budget pass (unchanged 1,010,935 raw / 270,614 gzip bytes). Migration `20261020140000_ps2_dvd_packaging` is replay-tested on disposable databases; the personal development database is unchanged. Detailed evidence and limitations are recorded in the DVD authoring guide.

Switch verification: 1,179 unit/component tests, 10 packaging + 52 core-schema + 8 game-catalog integration checks, 41 upload checks and all 28 desktop/mobile packaging/console-viewer browser checks pass. Focused reruns confirm the opaque-art rule independently of the housing blend cap. Lint, typecheck, schema validation, production build, fixture generation, documentation links, formatting/whitespace and deferred bundle budget pass (1,010,956 raw / 270,628 gzip bytes). Migration `20261020150000_switch_case_packaging` is replay-tested on disposable PostgreSQL/MinIO; the personal development database is unchanged. Desktop/mobile synthetic-case screenshots were inspected. Detailed evidence and limitations are recorded in the Switch authoring guide.

---

## TASK 14.4 — Cartridge Renderer

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Implement:

```text
base cartridge GLB
+
label texture
```

Status: **Completed 2026-10-20.** Added separate PhysicalMediaTemplate, PhysicalMediaTextureSlot and PhysicalMediaTextureBinding persistence with same-template composite relationships, component-kind/exclusivity checks, reviewed readiness, immutable ready contracts and asset-family cleanup protection. A dedicated private geometry target attaches an authored cartridge GLB directly to a draft; an explicit FRONT_LABEL binding supplies release-specific artwork. Cartridge administration reuses the existing curation form mechanics with separate media services. Game details select packaging or media in one lazy viewer, preserving independent labels, bounded resources, cleanup, keyboard/touch, reduced motion and static fallback. The original stepped-cartridge study uses labeled synthetic dimensions and no retail artwork. Manual hasBox and expected-component semantics remain unchanged; owned presence, other media formats and public presentation are inactive. Documentation: [Cartridge authoring](docs/operations/CARTRIDGE_AUTHORING.md).

Verification: 1,187 unit/component tests (81 files, two workers, unchanged timeouts), 8 media + 10 packaging + 52 core-schema + 8 game-catalog integration checks, all 45 PostgreSQL/MinIO upload checks and all 30 desktop/mobile cartridge/packaging/shared-viewer browser checks pass. Coverage includes two releases sharing geometry with independent label assets, two preview components sharing a shell/source with distinct label transforms, neutral missing labels, lazy transfers, fresh-session teardown, valid foreign-slot rejection, immutable ready models, stale/revoked access, private provenance, draft replacement and cleanup references. The new integration slice exposed and fixed a packaging-only ordinary-edit check; media assignments are now retained correctly. Neutral/textured desktop/mobile screenshots were inspected. Lint, typecheck, schema validation, production build, fixture generation, documentation links, formatting/whitespace and bundle budget pass (1,011,263 raw / 270,732 gzip bytes). Migration `20261020160000_cartridge_renderer` is replay-tested in disposable databases/storage; the personal development database is unchanged. The broader pre-existing search-plan benchmark limitation remains recorded under Task 14.2 and was not rerun or suppressed. Task 14.5 is next and has not started.

---

## TASK 14.5 — Cartridge Template Expansion

MODEL:

`GPT-6 Luna`

REASONING:

`Medium`

Once the format and renderer are established, Luna can help define repetitive template metadata.

It must not redesign R3F architecture.

Status: **Completed 2026-10-20.** Added curator-supplied format and shell-variant metadata for NES US, Famicom, SNES US, Super Famicom, Genesis, Game Boy, Game Boy Color, Game Boy Advance and Nintendo 64, plus unspecified/other choices. Other requires a description; all metadata is strictly validated and bounded. These are descriptive choices for curator-supplied geometry, not retail models or measurement presets. Creation, administration and private detail summaries retain/display the metadata. Older templates read as unspecified without rewriting existing rows; conflicting retries fail and ready metadata stays immutable. Template choices retain the latest 50 revisions per format and every assigned revision. Cartridge-family revision numbering and the existing one-front-label renderer, readiness, private delivery and artwork bindings remain intact. No R3F, renderer descriptor, schema, dependency or migration change. Documentation: [Cartridge template metadata](docs/operations/CARTRIDGE_TEMPLATE_METADATA.md).

Verification: 1,211 unit/component tests (82 files, two workers, unchanged timeouts), 11 media + 10 packaging + 8 game-catalog integration checks and all 45 PostgreSQL/MinIO upload checks pass. Coverage includes all metadata keys, explicit dimensions/mappings, bounded/unsupported values, legacy defaults without writes, idempotence/conflicting retries, role checks, ready immutability, private summaries and per-format selection bounds with retained assignments. All 14 distinct desktop/mobile cartridge/packaging browser cases pass: 12 packaging cases passed in the initial run, and both cartridge cases passed in a fresh focused run after correcting the new selector's accessible name. Lint, typecheck, production build, documentation links, formatting/whitespace and bundle budget pass. The deferred 3D chunk is unchanged at 1,011,263 raw / 270,732 gzip bytes. No schema migration is required and the personal database is unchanged. The previously documented broader search-plan benchmark limitation was not rerun or suppressed. Task 14.6 — 3D System Review is next and has not started.

---

## TASK 14.6 — 3D System Review

MODEL:

`GPT-6 Astra`

REASONING:

`High`

Review:

- GPU usage
- memory cleanup
- texture loading
- component architecture
- mobile performance
- template scalability

Status: **Completed 2026-10-20.** Reviewed GPU work, resource ownership, texture admission/loading, shared component boundaries, mobile behavior and template growth. No new blocking production defect identified. Added real-browser graphics, bitmap and compositing-canvas lifetime checks across all six packaging formats and cartridges, covering 30 assembled viewing sessions and 78 decoded/closed bitmaps. Recorded the existing Safari native-memory limitation, owner-waived Android testing, unmeasured physical-device performance for the new shapes and nonblocking template-query/curation growth follow-ups. See the [review report](docs/architecture/3D_SYSTEM_REVIEW.md) and [34-group evidence](docs/performance/3D_SYSTEM_REVIEW_EVIDENCE.json).

Verification: lint, typecheck, production build, formatting/whitespace, unchanged deferred bundle budget, 1,211 unit/component cases, 21 disposable-PostgreSQL packaging/media integration cases and all 50 distinct desktop/mobile browser cases pass across the initial run and focused rerun. Three overall-study timeouts were investigated and the corresponding workflow/five-cycle budgets calibrated; individual loading, idle, cleanup and memory assertions remain unchanged. No production behavior, schema, dependencies, public delivery or personal database changes. Task 15.1 — Build Game Detail Page is next and has not started.

---

# PHASE 15 — Game Detail Page

## TASK 15.1 — Build Game Detail Page

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Hero:

- cover
- title
- platform
- publisher
- year
- rating
- region
- edition

Sections:

```text
My Copy
About
Screenshots
Physical Edition
Edition Contents
Trailer
```

Status: **Completed 2026-10-20.** Built a cover-led, responsive private game detail page with a single title, scoped release identity and all six sections in the planned order. Personal photos sit under My Copy; sourced playtime sits under About. Existing management controls, source attribution, section links and lazy media/3D behavior remain available. Added contained cover failure/absence states, precision-preserving market dates and a bounded catalog product-identifier read that stays separate from copy observations. Rating displays “Not recorded” because typed rating storage/acceptance remains deferred in the accepted enrichment architecture. See the [implementation notes](docs/operations/GAME_DETAIL.md).

Verification: lint, typecheck, production build, formatting/whitespace, unchanged deferred 3D bundle budget, 1,221 unit/component cases, 34 disposable-PostgreSQL game integration cases and 20 distinct desktop/mobile browser cases pass. Browser coverage includes the new detail layout, 320px reflow, desktop 200% zoom, themes, reduced motion, cover precedence/failures, section navigation, scoped access and existing copy CRUD, galleries, trailers, playtime and physical previews. Light desktop and dark mobile screenshots were visually reviewed. No schema, dependency or public-delivery changes. Task 15.2 — Game UX Polish is next and has not started.

---

## TASK 15.2 — Game UX Polish

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Use Magic UI and Motion without overwhelming cover artwork.

Status: **Completed 2026-10-20.** Added a restrained Motion selected-section pill with URL-fragment/history synchronization and a visible, accessible selected state for primary and supporting links. Native section anchors remain usable before hydration and without JavaScript. Screenshot thumbnails now play the existing Magic UI entry only when entering view; dialog images switch immediately with a short opacity transition. Live reduced-motion changes restore static presentation without stale images or lost focus. The cover stays contained and stationary. Uses existing shared timings, preference handling and libraries; no data, permission or schema changes. See the [game detail notes](docs/operations/GAME_DETAIL.md#game-ux-polish).

Verification: lint, typecheck, production build, formatting/whitespace, unchanged deferred 3D bundle budget, all 1,221 unit/component cases, five disposable-PostgreSQL screenshot integration cases and all 16 desktop/mobile browser cases pass. Browser coverage includes deep links/history, keyboard navigation, live reduced-motion changes, immediate gallery replacement/focus restoration, 320px JavaScript-free links, existing detail fallbacks/access, gallery curation and stale-caption protection. Visually reviewed light/dark selected navigation and desktop/mobile gallery screenshots. Task 16.1 — Accessory Domain is next and has not started.

---

# PHASE 16 — Accessories

## TASK 16.1 — Accessory Domain

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Implement:

```text
Accessory
AccessoryVariant
AccessoryVariantPlatform
OwnedAccessory
```

Support multiple compatible platforms.

Core entities already established in Task 4.1 are reused here. Implement feature services, validation, catalog management and only the approved feature-specific schema additions; do not recreate or independently redesign core tables.

Shared description, specifications and video belong to Accessory; variants may provide differences. Compatibility is explicit per variant. Copying another variant's compatibility list during creation requires review; do not dynamically inherit it.

Status: **Completed 2026-10-20.** Reused the core family/variant/market/compatibility/owned-subtype tables and added administrator catalog management at `/app/catalog/accessories`. Added strict validation, batched explicit multi-platform compatibility with notes, reviewed initial compatibility copying, whole-field family fallback, scoped private domain/owned identity reads, external references, manual history, stale-revision protection and reversible archives. Added the structured family/variant video columns using the existing video contract and public-approval defaults. Typed rating persistence remains deferred. Owned-copy mutations, enrichment and detail/media presentation remain in Tasks 16.2–16.4. See [Accessory catalog operations](docs/operations/ACCESSORY_CATALOG.md).

Verification: lint, typecheck, Prisma schema validation, production builds, formatting/whitespace, unchanged deferred 3D bundle budget, all 1,236 unit/component cases, 89 distinct disposable-PostgreSQL accessory/catalog/repository/core-schema cases and 26 distinct desktop/mobile catalog browser cases pass across the full and focused runs. Verified migration replay, transactional rollback, permission rechecks/revocation, concurrent edits, explicit compatibility independence, whole-object overrides, archived links, owned subtype boundaries, source review, invalid/stale form retention and 320px dark/reduced-motion layouts. Reviewed light desktop and dark mobile screenshots; shortened long-title Edit actions and labeled history fields for readability. Test permission-property expectations, alert-selector collisions with the framework announcer and a typecheck/client-generation overlap were corrected and rerun; no assertions or timeouts were weakened. The personal database was not migrated. Owned-copy CRUD is recorded in Task 16.2 below.

---

## TASK 16.2 — Accessory CRUD

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Implement complete CRUD.

Status: **Completed 2026-10-20.** Added guided accessory-copy creation and basic private copy pages at `/app/accessories/new` and `/app/accessories/[id]`, linked from the workspace, collection, search and command palette. Editors select existing families/variants; compatibility, markets, producer and version facts remain canonical. Personal serials, observed markings, location, nullable has-box, notes and structured initial defects reuse the shared copy system. Added revision-protected editing, explicit variant correction, archived-identity retention, no-op preservation, unpublishing on meaningful edits and confirmed copy-only deletion. Creation retries use one reference and submitted snapshot to prevent duplicates after lost responses. Personal photo and GLB uploads reuse the existing asset pipeline with staged files, sequential uploads, recovery and no automatic resend of uncertain requests. Custom models support private upload/download, scoped selection, catalog fallback, pagination and removal while preserving stored bytes. Basic read/manage pages link to Photos and Defects; enrichment and richer detail/media/3D presentation remain in Tasks 16.3–16.4. No schema or dependency additions. See [Accessory copy operations](docs/operations/ACCESSORY_COPIES.md).

Verification: lint, typecheck, production builds, formatting/whitespace, the unchanged deferred 3D bundle budget, all 1,247 unit/component cases, 158 distinct disposable-PostgreSQL accessory/catalog/game/repository/schema/defect cases and 26 distinct desktop/mobile browser checks pass across the full and focused runs. Verified atomic create/edit/delete rollback, permission revocation under locks, concurrent saves/edits, idempotent response recovery, catalog/copy revision conflicts, archived records, model approval reset and scope, preservation of other copies/catalog/assets, viewer access, real photo/model uploads, uncertain upload retention and all copy discovery links. Reviewed desktop and dark mobile screenshots, including 320px reduced-motion layouts and 200% text size with reachable save/cancel controls. The zoom check exposed a shared-header overflow; header actions now wrap when space is tight, with collection/search and keyboard-focus regressions checked. Fixture metadata/lineage constraints, separate browser actors and browser-test selection were corrected; no assertions or timeouts were weakened. The personal database was not migrated. Accessory enrichment is recorded in Task 16.3 below.

---

## TASK 16.3 — Accessory Enrichment

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Reuse enrichment infrastructure.

Do not create a separate AI system.

Status: **Completed 2026-10-20.** Extended the existing enrichment runs, suggestions, review, acceptance receipts and immutable metadata history to accessory families and variants. Added an optional Wikidata adapter, disabled by default, with bounded transport, explicit retry/cancellation, English/default multilingual labels and evidence validation. Families support reviewed name, description, release year, one resolved existing manufacturer, selected product video and appended references. Variants accept references only; product evidence never establishes variant compatibility, color, edition or market facts. Source image pages, catalog codes, edition numbers and rating text remain inspectable observations; typed accessory ratings and package contents remain unavailable. Editors prepare previews and administrators accept them with per-field manual replacement acknowledgements, revision checks and atomic writes. Added optional review links to copy creation and active copy pages, retaining personal drafts and staged files through catalog refresh. No separate AI system or new dependencies. See [Accessory enrichment operations](docs/operations/ACCESSORY_ENRICHMENT.md).

Verification: lint, typecheck, production builds, formatting/whitespace, the unchanged deferred 3D bundle budget, all 1,272 unit/component cases, 134 disposable-PostgreSQL integration cases and 14 desktop/mobile browser checks pass. Coverage includes existing game enrichment and accessory-copy regressions, manufacturer ambiguity and dependencies, parent/root revision conflicts, receipt idempotency, atomic rollback, authorization/revocation, retry/cancellation, source identity validation, variant scope, manual replacement, stale copy saves and preservation of notes/photos during refresh. Reviewed desktop and dark mobile screenshots, including 320px reduced-motion layouts and the existing 200% text-size copy flow. Live search validated accessory discovery; a real multilingual label response informed deterministic adapter coverage. Transient live fetch failures remain sanitized retryable outcomes. Apply the new allowlist migration and opt in to Wikidata before lookup; the personal database was not migrated. Accessory detail is recorded in Task 16.4 below.

---

## TASK 16.4 — Accessory Detail

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Include:

- images
- information
- compatibility
- personal copy
- 3D
- video

Status: **Completed 2026-10-20.** Expanded `/app/accessories/[id]` with an accessory hero and native section links for My copy, Product information, Compatibility, Gallery, Specifications and Video. Reused the existing canonical family/variant fallback policy with explicit source scopes and whole-group specification overrides; selected-variant compatibility notes remain independent of sibling variants and commercial markets. Added separate bounded catalog galleries and copy photos, retained image/model source attribution, stable hero posters, honest unknown/archived states and links to all photos/defects. Model download and interactive viewing share copy-custom → variant → family selection. The existing on-demand viewer rechecks private authorization, copy revision and selected model/catalog revisions before loading; video reuses the structured reference and explicit-activation player. Existing copy edit/delete, enrichment, uploads and model management remain available to authorized managers. No schema changes or dependencies. See [Accessory detail operations](docs/operations/ACCESSORY_DETAIL.md).

Verification: lint, typecheck, production builds, formatting/whitespace, unchanged deferred 3D bundle budget, all 1,273 unit/component cases, 62 relevant disposable-PostgreSQL integration cases and 22 distinct desktop/mobile browser checks pass across full and focused runs. Verified variant/family and whole-group fallback, compatibility isolation, bounded galleries, source attribution, current authorization/revocation, wrong-kind identities, shared download/view model selection, stale or removed models, actual private GLB rendering, explicit video activation, static/download failure recovery and existing accessory CRUD/game detail regressions. Reviewed light desktop/mobile and narrow dark screenshots, with long titles, reduced motion and 200% text size. Corrected fixture lifecycle/subtype assumptions, a test selector type and a section-navigation timing assertion; no assertions or timeouts were weakened. Tests use synthetic artwork/geometry and disposable PostgreSQL/MinIO; the personal database was not migrated. Dashboard UX is recorded in Task 17.1 below.

---

# PHASE 17 — Dashboard

## TASK 17.1 — Dashboard UX

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Create:

- total items
- consoles
- games
- accessories
- boxed items
- defective items
- recently added

Use:

- Number Ticker
- Bento Grid
- Animated List

Status: **Completed 2026-10-21.** Replaced the `/app` welcome screen with a private dashboard in the existing application shell. Added owned-copy totals by category, confirmed boxed-copy count, distinct copies with ACTIVE defects and the latest eight additions with thumbnails, catalog context, UTC date labels and copy-specific links. Added a semantic Bento Grid and accessible Number Ticker adaptation, reusing the existing Animated List equivalent with static server content and live reduced-motion support. Current roles govern creation/catalog links and read-only labels; counts and recent DTOs omit personal/account/storage fields. Baseline database-side counts and bounded recent queries share an authorized Repeatable Read snapshot, with the existing batch thumbnail resolver. Empty/error/image-failure states stay truthful, and an explicit refresh retains existing values while pending and works as a native GET form without JavaScript. No new schema, dependency, public endpoint, polling or cache. See [Dashboard operations](docs/operations/DASHBOARD.md). Aggregate consolidation and measured optimization remain in Task 17.2.

Verification: lint, typecheck, production builds, formatting/whitespace, unchanged deferred 3D bundle budget, all 1,276 unit/component cases, 32 disposable-PostgreSQL dashboard/access integration cases and 34 desktop/mobile dashboard/access browser checks pass. Verified multiple owned copies versus unowned catalog entries, unknown box values, deduplicated ACTIVE defects, accepted/repaired exclusion, stable recent ordering and limits, thumbnail/serial-image boundaries, archive retention, copy deletion, current role/grant/session checks, private DTO minimization, failed reads without fake zeros, screen-reader count stability, late-animation cleanup, native and enhanced refresh, and existing authentication flows. Reviewed light desktop, dark narrow and JavaScript-free screenshots with long titles, 320px, 200% text and reduced motion. Corrected a game-release field mismatch, narrowed existing access-test selectors to the page heading and removed a streamed loading fallback that hid resolved content without JavaScript; no assertions or timeouts were weakened. Test artwork is synthetic and storage/databases are disposable; the personal database was not migrated. Task 17.2 — Dashboard Queries is recorded below.

---

## TASK 17.2 — Dashboard Queries

MODEL:

`GPT-6 Sol`

REASONING:

`Medium`

Optimize aggregate database queries.

Avoid loading entire collections just to calculate counts.

Status: **Completed 2026-10-21.** Consolidated all six dashboard counts into one database aggregate, with one collection scan and a once-only distinct ACTIVE-defect copy count. Recent identities are limited to nine IDs before indexed subtype/canonical hydration; a photo-only batch resolves the eight displayed copies through the shared collection-card thumbnail policy without unused producer joins or defect summaries. Authorization and all data reads remain in the existing Repeatable Read snapshot; counts, ordering, copy links, private-field exclusions and UI behavior are preserved. No migration, new index, cache, dependency or public endpoint. See [dashboard query evidence and reproduction](docs/performance/DASHBOARD_QUERIES.md).

Verification: lint, typecheck, production build, repository formatting/whitespace, all 1,276 unit/component cases, 37 relevant disposable-PostgreSQL integration cases and 34 desktop/mobile dashboard/access browser checks pass. Added a concurrent-deletion snapshot regression and a 6,012-copy fixture with 2,405 defects, 607 photo bindings and 1,821 assets. EXPLAIN ANALYZE confirms one aggregate collection scan, indexed reads for nine recent IDs and bounded subtype/photo hydration. In the recorded warm-cache sample, consolidated counts accessed 391 shared buffers versus 2,161 across the six previous count SQL equivalents; timings and limits are documented without a production latency guarantee. Existing shared-card tests verify primary/thumbnail selection, deletion fallback and photo privacy. Test databases and storage are disposable; the personal database was not migrated. Task 18.1 — Public Privacy Architecture is recorded below.

---

# PHASE 18 — Public Collection / Digital Museum

All Phase 18 tasks follow the [Public Privacy Architecture](docs/architecture/PUBLIC_PRIVACY_ARCHITECTURE.md). Its implementation handoff assigns prerequisite publication/settings commands and writer coordination to Task 18.2, private administrator settings/review controls to Task 18.3, contextual public media/component approval completion to Task 18.5, and indexing/review work to Tasks 18.6–18.7. Expose only capabilities whose applicable gates are implemented and verified; public defaults remain disabled during development.

## TASK 18.1 — Public Privacy Architecture

MODEL:

`GPT-6 Astra`

REASONING:

`XHigh`

Design public/private separation.

Default hidden:

- serial number
- precise location
- notes
- account information

Determine exactly how:

`PublicSettings`

controls public queries.

Refine the previously established publication contracts; do not postpone privacy decisions until this phase. `PublicSettings` exclusively owns the global toggle. New items/media are private; public delivery requires item/media approval and asset eligibility, including direct requests and derivatives. Public URLs retain the same data contract for logged-in visitors.

Status: **Completed 2026-10-21 (design only).** Refined the existing publication contracts into explicit PublicSettings semantics, public field/DTO allowlists, published-only search/count/facet rules, snapshot/error behavior and identical public responses for anonymous and authenticated visitors. Defined administrator review and atomic affected-copy invalidation when visibility settings widen; retained stricter existing edit invalidation. Specified contextual media resolution, exact approved display pointers, derivative/input-rights checks, a conservative sanitized-media profile, component/trailer approval requirements and current-policy/no-store GET/HEAD/range/conditional delivery. Recorded concrete repository gaps, mutation/locking coordination, staged implementation ownership and an adversarial acceptance matrix. Linked the refinement from the domain, repository and storage architecture documents.

Verification: reviewed the specification, existing schema/mutations/search/media boundaries and prior architecture contracts; checked documentation formatting, local links/anchors, fences, whitespace and documentation-only scope. No application code, schema, migrations, dependencies, configuration or publication settings changed; runtime suites were not rerun for this design-only task. Deliverable: [Public Privacy Architecture](docs/architecture/PUBLIC_PRIVACY_ARCHITECTURE.md). Task 18.2 — Public Query Layer is recorded below.

---

## TASK 18.2 — Public Query Layer

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Create explicit methods such as:

```text
getPublicCollection()
getPublicConsole()
getPublicGame()
getPublicAccessory()
```

Never fetch private models and hide properties in React.

Status: **Completed 2026-10-21.** Added separate public collection/home/console/game/accessory services, conditional repository projections, strict public controls and dynamic server feature entry points without a session/audience override. Published-only matching, category/box counts, bounded paging and scoped facets remain database-side; hidden notes/defects cannot affect matching/ranking and serial/repair search stays private. Detail projections expose only permitted personal fields and safe canonical facts, scoped credits/compatibility, expected contents and truthful whole-group playtime fallback. Added current-ADMIN settings/item review and publication commands with revision/freshness checks, atomic invalidation when settings widen and preserved pause/no-op semantics. Centralized the shared publication guard at the existing transaction boundary; approval/settings writes take its exclusive side and public snapshot reads are database-enforced read-only. Location ancestor changes invalidate exposed copies. Public photos remain explicit placeholders until contextual delivery in Task 18.5. No new dependency, schema/migration, public page/HTTP endpoint, shared cache or personal publication change. Documentation: [Public query operations](docs/operations/PUBLIC_QUERIES.md).

Verification: lint, typecheck, production build, formatting, local documentation links/fences and whitespace pass, along with all 1,312 unit/component cases, 639 relevant PostgreSQL integration cases, 45 asset-pipeline cases and 48 desktop/mobile access/dashboard/location browser checks. New tests cover all sixteen personal-field selection combinations, published copies versus canonical/private identities, conditional detail/search/filter boundaries, real empty/unavailable results, scoped counts/facets/pagination, stale and revoked administrators, settings/content concurrency, read-only enforcement, location subtree invalidation, snapshot deletion, safe media placeholders and 6,012-copy execution plans. Fixed a reserved SQL alias and materialized public facts once so stale publication statistics cannot repeat identity hydration per match; production/test timeouts and assertions remain unchanged. Existing private search functional regressions pass; its unrelated pre-existing complete-search timing benchmark was outside this run, as documented in the operations notes. Databases/storage are disposable and the personal database was not migrated or published. Home presentation and administrator controls follow in Task 18.3.

---

## TASK 18.3 — Public Collection Home

MODEL:

`GPT-6 Sol`

REASONING:

`High`

This can use Magic UI more heavily.

Design it like:

`a personal digital video game museum`

not:

`an admin dashboard`.


Status: **Completed 2026-10-21.** Added the dynamic `/collection` home with a warm museum-style hero, published-only statistics, an eight-copy recent exhibit and honest private/empty/unavailable states. Reused Magic UI Blur Fade, Number Ticker and Bento components with complete server-rendered content, themes and reduced-motion behavior. `/` consistently redirects to `/collection`; static foundation examples moved to `/design-preview`. Public HTML/Flight/HEAD/not-found outputs use no-store headers and never consult authentication. Added the prerequisite private ADMIN publication controls at `/app/settings/public`, discoverable from the dashboard: bounded owned-copy selection, labelled public text previews, explicit fresh reviews, widening-impact disclosure, approval/removal and stale/revoked-access handling. Copy selection jumps directly to its review; keyboard review focus is deliberate. Unsupported photo/indexing capabilities are rejected server-side. No dependency, migration, public browse/detail/media route or personal publication change. Documentation: [Public home operations](docs/operations/PUBLIC_HOME.md).

Verification: lint, typecheck, production builds, formatting, documentation links/fences and whitespace pass. All 1,321 unit/component tests and 20 public-query/publication PostgreSQL integration tests pass. Ninety distinct desktop/mobile browser checks pass: ten new public-home/review cases, thirty-four existing access/dashboard cases and forty-six foundation/auth/theme/motion cases; the final anchored administrator review flow also passed a focused rerun on both devices. Coverage includes anonymous/admin/editor/viewer HTML and Flight privacy, redirects/HEAD/not-found cache policy, pause/reopen, empty collections, widening invalidation, individual approval/removal, stale and revoked administrators, origin checks, disabled capabilities, no-JavaScript public rendering, long titles, 320px layouts, enlarged text and live reduced motion. Inspected light/dark public and private review screenshots. Database/storage fixtures are disposable; the personal database was not migrated or published. Public browsing follows in Task 18.4.

---

## TASK 18.4 — Public Browse Pages

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Implement:

- consoles
- games
- accessories
- search
- filtering


Status: **Completed 2026-10-21.** Added the public console, game and accessory browse routes plus `/collection/search`, linked from the museum home. Server-rendered native GET forms provide bounded, bookmarkable search, category/canonical/box filters, sorting, active-filter removal and twenty-copy pagination without JavaScript. Public pages call the existing public-only service directly; the separate GET/HEAD `/api/search/public` endpoint uses the same strict URL adapter and read-only query contract. Category routes reject type overrides, duplicate/unknown controls fail closed and current policy is checked before malformed-input responses. Location/defect filter availability is advertised only when permitted in the same snapshot; counts and options remain scoped to matching published copies. Added truthful empty/deleted-page states, option-overflow/page-cap hints, generic not-found/error recovery and no-store HTML/Flight/JSON/HEAD/method responses. Native controls now reset to navigated URL state, including after clearing filters with unsaved text. Kept noindex metadata and neutral photo placeholders; detail/media delivery remains Task 18.5. No dependency, migration, private-query reuse or personal publication change. Documentation: [Public browsing operations](docs/operations/PUBLIC_BROWSING.md).

Verification: lint, typecheck, production builds, formatting, documentation links/fences and whitespace pass, along with all 1,360 unit/component tests, 22 public-query/publication PostgreSQL integration tests and fifty distinct desktop/mobile browser checks (twelve public browse, ten public home/review, twenty private collection and eight foundation/recovery). Coverage includes anonymous/admin/editor/viewer HTML/Flight/JSON privacy, forty-five copies of one release over three stable pages, combined and fuzzy search, current optional-field gates, safe facet fallback, refresh/history/deletion, malformed/duplicate/oversized controls, disabled 404s, HEAD/conditional/method caching, database-unavailable recovery, JavaScript-free forms/paging, long titles, dark/light themes, 320px layouts and enlarged text. Inspected public light/dark screenshots. Corrected an older private-collection test to select its main-content link and made pagination assertions await their requested page before reading IDs/URLs; assertions and production/test timeouts remain intact. Fixtures use disposable PostgreSQL/MinIO; the personal database was not migrated or published. Public details and contextual media follow in Task 18.5.

---

## TASK 18.5 — Public Detail Pages

Status: **Completed 2026-10-21.** Added public owned-copy console/game/accessory details and linked home/browse titles to them. Server-rendered catalog facts and optional copy observations stay separate, with reviewed image galleries, neutral/error fallbacks and on-demand whole-model/component 3D. Separate public media/presentation services resolve exact item/catalog/site/component contexts under current policy, publication, relationship, content-review and recursive input-rights gates. GET/HEAD/range/conditional requests reauthorize before exposing bytes or file metadata; direct optimizer requests cannot cache revocable media. Added current-ADMIN exact-output/media/component review operations and private controls, stale-review/origin checks, personal-copy invalidation and reviewed personal-media enablement. The component-review migration records reviewer/time/template revision, clears legacy approvals, invalidates changed bindings/templates and permits explicitly curated DISPLAY geometry. No private URLs, originals, unapproved derivatives, source asset IDs, external video descriptors or provider metadata enter public output. Indexing remains disabled for Task 18.6. No new dependency, renderer, preview generator or personal publication change. Documentation: [Public detail and media operations](docs/operations/PUBLIC_DETAILS.md).

Verification: all 1,373 unit/component tests, 48 public-query/publication/packaging/cartridge PostgreSQL integration tests and 42 distinct desktop/mobile browser checks pass (ten public detail/media/review, twelve public browse, ten public home/review and ten foundation/recovery). Coverage includes role-independent HTML/Flight, private/wrong-category IDs, approved image decoding, no-JavaScript reading, exact contextual media, ranges/HEAD/conditionals, optimizer denial, settings/publication/rights withdrawal, stale and unauthorized reviews, no-op approval and withdrawal after rights revocation, component slot/approval resets, expected-content labeling, reduced motion, generic unavailable-database recovery and 320px dark layouts. Production builds, lint, typecheck, schema validation, formatting, documentation links and whitespace pass. Inspected light and narrow dark screenshots. Earlier parallel-load timeouts were rerun successfully with unchanged test/production limits; corrected fixture identity and ambiguous-locator assertions. Migration and delivery tests use disposable PostgreSQL/MinIO; the personal database was not migrated or published. Task 18.6 — Public SEO Controls is next and has not started.

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Use rich visual presentation.

Allow 3D where assets are public-safe.

---

## TASK 18.6 — Public SEO Controls

MODEL:

`GPT-6 Sol`

REASONING:

`Medium`

Implement:

`allowSearchEngineIndexing`

and metadata.

---

## TASK 18.7 — Privacy Review

MODEL:

`GPT-6 Astra`

REASONING:

`XHigh`

Attempt to find ways private data could leak.

Inspect:

- server responses
- Server Components
- APIs
- metadata
- serialized props
- OpenGraph generation
- asset URLs
- search
- error states

Sol fixes all findings.

---

# PHASE 19 — Test Expansion

## TASK 19.1 — Unit Test Expansion

MODEL:

`GPT-6 Luna`

REASONING:

`Medium`

Add tests around already-established behavior.

Do not rewrite production logic to satisfy poorly designed tests.

---

## TASK 19.2 — Integration Tests

MODEL:

`GPT-6 Sol`

REASONING:

`Medium`

Focus on:

- services
- repositories
- permissions
- transactions
- public/private queries

---

## TASK 19.3 — Playwright Critical Paths

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Cover:

1. login
2. authorization
3. console CRUD
4. game CRUD
5. accessory CRUD
6. location CRUD
7. photo upload
8. search
9. filters
10. enrichment
11. public collection
12. privacy

---

## TASK 19.4 — Additional E2E Coverage

MODEL:

`GPT-6 Luna`

REASONING:

`Medium`

Expand edge-case coverage once core Playwright patterns exist.

---

# PHASE 20 — Accessibility & Responsive Review

## TASK 20.1 — Accessibility Audit

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Audit:

- keyboard
- focus
- ARIA
- forms
- dialogs
- contrast
- screen reader semantics
- reduced motion

---

## TASK 20.2 — Mobile UX Review

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Specifically test:

- adding games
- adding consoles
- camera uploads
- filters
- dialogs
- 3D touch controls

---

# PHASE 21 — Performance

## TASK 21.1 — Performance Investigation

MODEL:

`GPT-6 Astra`

REASONING:

`High`

Analyze:

- React boundaries
- queries
- R3F
- assets
- bundles
- client JS
- N+1 database queries

Do not optimize blindly.

---

## TASK 21.2 — Apply Performance Improvements

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Implement findings.

---

# PHASE 22 — Deployment

## TASK 22.1 — Production Docker

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Create production deployment for:

```text
reverse proxy
Next.js
PostgreSQL
object storage
```

---

## TASK 22.2 — Backup Strategy

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Implement/document:

- PostgreSQL backup
- asset backup
- restore process

A backup without a tested restore procedure is not considered complete.

---

## TASK 22.3 — Production Security Review

MODEL:

`GPT-6 Astra`

REASONING:

`XHigh`

Review:

- Docker
- secrets
- uploads
- auth
- OAuth
- PostgreSQL
- object storage
- reverse proxy
- headers
- public endpoints

---

# PHASE 23 — Final Architecture Review

## TASK 23.1 — Whole Repository Review

MODEL:

`GPT-6 Astra`

REASONING:

`XHigh`

Prompt:

```text
Review this repository as a principal engineer preparing it for a production release.

Do not focus on minor style preferences.

Find meaningful problems involving:

- architecture
- security
- data integrity
- Prisma/database design
- performance
- Next.js server/client boundaries
- authorization
- privacy
- object storage
- 3D resource management
- AI enrichment
- external provider abstractions
- maintainability
- testing gaps

Categorize findings:

Critical
High
Medium
Low

For every finding provide:

- exact location
- reason
- consequence
- recommended fix

Do not implement changes yet.
```

---

## TASK 23.2 — Apply Final Review

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Give Sol Astra's report.

Prompt:

```text
Implement all Critical, High, and justified Medium findings from the attached architectural review.

Preserve intended product behavior.

After implementation run:

- lint
- typecheck
- unit tests
- integration tests
- Playwright critical-path tests

Report anything intentionally not changed and explain why.
```

---

# PHASE 24 — Cleanup

## TASK 24.1 — Dead Code and Dependency Cleanup

MODEL:

`GPT-6 Luna`

REASONING:

`Medium`

Find:

- unused files
- unused dependencies
- stale exports
- obsolete comments
- unused utilities

Do not perform architectural refactors.

---

## TASK 24.2 — Documentation

MODEL:

`GPT-6 Luna`

REASONING:

`Medium`

Update:

```text
README.md
.env.example
development setup
testing
database migrations
deployment
backup
restore
```

---

# Recurring Rule After Every Significant Feature

Use:

## Implementation

`GPT-6 Sol / High`

then:

## Tests

`GPT-6 Sol / Medium`

or Luna when repetitive.

Then run:

```text
pnpm lint
pnpm typecheck
pnpm test
```

and relevant Playwright tests.

---

# When to Request an Astra Review

You do NOT need Astra after every small task.

Use Astra after these boundaries:

```text
Domain model
Authentication
Core Prisma schema
Search architecture
Consoles + first 3D implementation
AI enrichment
Physical game 3D
Public/private architecture
Performance
Production security
Final repository
```

---

# Tasks Where Astra Should Be Mandatory

I would personally not proceed past these without an Astra review:

```text
0.2 Domain Model
3.6 Authentication Security
4.2 Prisma Schema
9.1 3D Architecture
13.1 AI Enrichment Architecture
14.1 Packaging Architecture
18.1 Public Privacy Architecture
18.7 Privacy Review
22.3 Production Security
23.1 Final Architecture Review
```

---

# Tasks Where Luna Is Appropriate

Use Luna for:

```text
seed expansion
fixture generation
test expansion
documentation
repetitive mappings
simple cleanup
renames
simple validation tests
template metadata
```

Never use Luna as primary model for:

```text
database design
authentication
authorization
security
AI architecture
public/private separation
3D architecture
major refactors
hard debugging
```

---

# Default Codex Configuration

If you open Codex and don't know which model to choose:

```text
GPT-6 Sol
Reasoning: High
```

That should be the normal setting for this project.

---

# For Very Small Tasks

Use:

```text
GPT-6 Sol
Reasoning: Medium
```

Example:

```text
Add a Region combobox to the existing accessory form using the project's existing form conventions.
```

---

# For Repetitive Tasks

Use:

```text
GPT-6 Luna
Reasoning: Medium
```

Example:

```text
Add fixture-based tests for all region normalization cases using the existing test structure. Do not change production code.
```

---

# For Hard Architectural Tasks

Use:

```text
GPT-6 Astra
Reasoning: High
```

or rarely:

```text
GPT-6 Astra
Reasoning: XHigh
```

---

# Avoid Max Reasoning by Default

Do not automatically select:

`Max`

for difficult work.

Start with:

`High`

and use:

`XHigh`

for exceptionally consequential or difficult tasks.

Use `Max` only if a genuinely difficult problem remains unresolved after a strong Astra attempt.

---

# Recommended Development Distribution

Expected approximate usage:

```text
GPT-6 Sol
████████████████
~80%

GPT-6 Astra
███
~15%

GPT-6 Luna
█
~5%
```

This percentage refers to development tasks, not necessarily token consumption or cost.

---

# Generic Sol Implementation Prompt

Use this as a wrapper around most implementation tasks:

```text
Read PROJECT_SPEC.md and DEVELOPMENT_PLAN.md before making changes.

Implement TASK [TASK_ID] only.

Before changing code:

1. inspect the existing implementation
2. understand established architectural patterns
3. identify the files that need modification

Requirements:

- preserve existing architecture
- use Server Components by default
- keep business logic outside React components
- keep database access outside UI components
- validate server input with Zod
- enforce authorization server-side
- use shadcn for functional UI
- use Magic UI only for meaningful visual enhancement
- use Motion directly only when required
- avoid unnecessary dependencies
- do not implement later tasks
- add/update tests
- add Prisma migrations when necessary

After implementation run:

- lint
- typecheck
- relevant tests

Fix failures before considering the task complete.

Finally report:

- what changed
- files changed
- migrations created
- tests added
- commands executed
- anything remaining
```

---

# Generic Astra Architecture Prompt

```text
Read PROJECT_SPEC.md and DEVELOPMENT_PLAN.md.

Review TASK [TASK_ID].

Do not implement code unless explicitly requested.

Act as the principal architect responsible for preventing downstream technical debt.

Inspect the existing repository and evaluate:

- domain correctness
- database implications
- security
- privacy
- performance
- maintainability
- consistency with existing architecture
- implications for future phases

Prefer the simplest architecture that satisfies the project requirements.

Provide:

1. recommended architecture
2. important decisions
3. alternatives considered
4. risks
5. implementation guidance for the engineer
6. acceptance criteria

Clearly identify anything that should be resolved before implementation begins.
```

---

# Generic Astra Review Prompt

```text
Review the implementation of TASK/PHASE [ID].

Do not rewrite code yet.

Focus on substantive issues rather than stylistic preferences.

Look for:

- architectural mistakes
- data integrity problems
- security vulnerabilities
- privacy leaks
- incorrect server/client boundaries
- unnecessary complexity
- poor database queries
- future scalability problems
- missing edge cases
- inadequate tests

Categorize findings as:

Critical
High
Medium
Low

For every finding provide:

- file/location
- issue
- impact
- recommended correction

If the implementation is architecturally sound, say so explicitly rather than inventing changes.
```

---

# Generic Luna Prompt

```text
Read the existing implementation and follow its patterns exactly.

Perform TASK [TASK_ID].

This is a narrowly scoped task.

Do not:

- redesign architecture
- change schemas unless explicitly instructed
- add dependencies
- refactor unrelated code
- alter application behavior outside the requested task

Run the relevant tests after making changes and report the result.
```

---

# Recommended First Development Sequence

If starting today, execute these first:

```text
0.1 Astra High
Review specification

0.2 Astra XHigh
Design domain model

0.3 Astra High
Repository architecture

1.1 Sol High
Initialize application

1.2 Sol High
PostgreSQL + Prisma

1.3 Sol High
Docker environment

1.4 Sol Medium
Testing setup

2.1 Sol High
shadcn + Magic UI

2.2 Sol High
Design system

2.3 Sol High
Animation conventions

2.4 Astra High
UI architecture review

3.1 Astra High
Authentication architecture

3.2 Sol High
Better Auth

3.3 Sol High
AccessGrant

3.4 Sol High
RBAC

3.5 Luna Medium
Auth test expansion

3.6 Astra XHigh
Security review

4.1 Sol High
Core Prisma schema

4.2 Astra XHigh
Schema review
```

At that point the foundation is strong enough to begin building the actual collection.

---

# Important Workflow Rule

Do not give an LLM several phases at once.

Bad:

```text
Build authentication, consoles, games, AI enrichment and public collection.
```

Good:

```text
Implement TASK 8.4 — Console Creation Flow.
```

A scoped task allows the model to:

- understand more of the relevant repository
- make fewer assumptions
- run better tests
- produce smaller diffs
- avoid architectural drift

The project should progress through small, reviewable commits.

---

# Git Strategy

Ideally create one branch or commit group per task.

Example:

```text
task/3-2-better-auth
task/4-1-core-schema
task/8-4-console-create
task/9-2-model-viewer
```

Commit after the task passes its checks.

This makes it much easier to revert a bad AI-generated implementation.

---

# Final Principle

Do not think of the three models as competing choices.

Treat them as roles:

```text
GPT-6 Astra
"What architecture should we use, and is this correct?"

GPT-6 Sol
"Build it."

GPT-6 Luna
"Do this repetitive, well-defined supporting work."
```

For this project, **GPT-6 Sol should remain your default Codex model**, while Astra acts as the architect/reviewer at important boundaries and Luna handles the small amount of genuinely repetitive work.
