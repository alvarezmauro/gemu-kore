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

---

## TASK 4.3 — Create Base Repositories

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Create repository conventions.

Do not make one enormous generic repository.

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

---

## TASK 7.3 — Command Palette

MODEL:

`GPT-6 Sol`

REASONING:

`Medium`

Implement:

`⌘K / Ctrl+K`

using shadcn Command.

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

---

## TASK 8.2 — Initial Console Seed Format

MODEL:

`GPT-6 Sol`

REASONING:

`Medium`

Create clean seed structure.

Do not populate hundreds of consoles yet.

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

---

## TASK 11.3 — Game CRUD

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Implement full OwnedGame CRUD.

---

## TASK 11.4 — Screenshots

MODEL:

`GPT-6 Sol`

REASONING:

`Medium`

Implement galleries and source metadata.

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

---

## TASK 12.3 — Provider Mapping Tests

MODEL:

`GPT-6 Luna`

REASONING:

`Medium`

Create extensive fixture-based tests.

Do not alter provider architecture.

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

---

## TASK 13.2 — Enrichment Service

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Implement the architecture approved by Astra.

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

---

## TASK 13.4 — Provenance

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Persist where imported metadata came from.

Never silently overwrite manual information.

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

---

## TASK 14.5 — Cartridge Template Expansion

MODEL:

`GPT-6 Luna`

REASONING:

`Medium`

Once the format and renderer are established, Luna can help define repetitive template metadata.

It must not redesign R3F architecture.

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

---

## TASK 15.2 — Game UX Polish

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Use Magic UI and Motion without overwhelming cover artwork.

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

---

## TASK 16.2 — Accessory CRUD

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Implement complete CRUD.

---

## TASK 16.3 — Accessory Enrichment

MODEL:

`GPT-6 Sol`

REASONING:

`High`

Reuse enrichment infrastructure.

Do not create a separate AI system.

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

---

## TASK 17.2 — Dashboard Queries

MODEL:

`GPT-6 Sol`

REASONING:

`Medium`

Optimize aggregate database queries.

Avoid loading entire collections just to calculate counts.

---

# PHASE 18 — Public Collection / Digital Museum

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

---

## TASK 18.5 — Public Detail Pages

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
