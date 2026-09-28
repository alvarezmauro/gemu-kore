# GemuKore — Agent Instructions

GemuKore is a web application for managing and showcasing a physical video game collection.

## Primary project documents

Before performing substantial work, read:

- `PROJECT_SPEC.md`
- `DEVELOPMENT_PLAN.md`

These documents are the primary source of truth for product requirements,
architecture, development sequencing, and implementation constraints.

If implementation details conflict with these documents, stop and identify
the conflict before changing the architecture.

## Development workflow

Work on one task from `DEVELOPMENT_PLAN.md` at a time.

Do not implement future phases unless explicitly requested.

For every task:

1. Read the relevant sections of `PROJECT_SPEC.md`.
2. Read the corresponding task in `DEVELOPMENT_PLAN.md`.
3. Inspect the existing repository before making changes.
4. State the intended implementation approach.
5. Implement only the requested task.
6. Run relevant checks.
7. Report what changed.

## Architecture principles

Preserve these rules unless explicitly changed:

- Canonical catalog data and owned collection items are separate concepts.
- `ConsolePlatform` and `ConsoleModel` are separate.
- `Game` and `GameRelease` are separate.
- `Accessory` and `AccessoryVariant` are separate.
- Business logic must not live inside React components.
- Database access must not live inside UI components.
- Server Components are preferred by default.
- Authorization must be enforced server-side.
- User input must be validated server-side.
- Third-party providers must be behind adapters.
- Private data must never leak through public queries.
- AI-generated/enriched metadata must be reviewable.
- Manually entered metadata must never be silently overwritten.
- Interactive 3D should be loaded only where needed.
- Mobile is a first-class experience.
- Accessibility and reduced-motion support are required.

## UI

Use:

- shadcn/ui for functional application primitives
- Magic UI for purposeful animated/visual enhancement
- Motion for custom transitions not covered cleanly by the above

Avoid visual overload.

Do not add additional UI or animation libraries without a clear architectural reason.

## Scope control

Do not:

- redesign architecture while implementing an unrelated feature
- add dependencies without justification
- implement future roadmap functionality prematurely
- introduce microservices, Redis, queues, or a separate API server unless the specification has been intentionally changed

## Quality checks

Before considering an implementation task complete, run the applicable:

- lint
- typecheck
- unit tests
- integration tests
- Playwright tests

Do not ignore failing checks.
