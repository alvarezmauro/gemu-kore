# Game catalog

Task 11.1 adds administrator catalog management at `/app/catalog/games`.
The console catalog links to this page. Games and game releases have separate
lists, forms, revisions, archive states, external references, and change history.

## Domain and editing

`Game` describes the work: title, slug, description, aliases, and developer
credits. `GameRelease` links that work to a console platform and describes an
edition/printing, languages, identification, region locking, market release
dates, company credits, and expected physical contents. Same-title games are
distinguished by slug in the release picker.

Dates preserve unknown month/day values. Validation rejects impossible dates,
days without months, and months without years. A company credit may apply to
the entire release or one of its selected markets. Worldwide cannot be combined
with another market.

`GameReleaseIncludedItem` is a flat expected-content list with a name, kind
(packaging, media, manual, extra), description, positive quantity, and order.
Retained items keep their IDs when edited. Catalog assets can target these
items; the database requires exactly one asset target and at most one primary
asset per item/role. This task does not add component asset-upload controls.

## Integrity and access

Reads and writes require administrator permission on the server. Writes validate
all inputs and linked records, recheck authorization under the shared catalog
lock, and commit the root, relations, references, and manual change history in
one transaction. Revision checks reject stale edits while preserving the form
draft. Records use reversible soft archives. Existing archived links may be
retained; new links must be active.

The migration `20261017090000_game_expected_contents` adds the component enum,
table, constraints, and asset target. Existing Game and GameRelease tables are
reused. Apply this migration through the normal database deployment workflow.
Verification uses disposable databases and does not migrate the developer's
personal database.

## Scope

No owned copies are created or modified by these forms. The game creation flow
is Task 11.2, owned-game CRUD is Task 11.3, screenshots are Task 11.4, trailers
are Task 11.5, and playtime is Task 11.6. Templates, primary-package semantics,
and per-copy component presence remain in Phase 14. No provider, enrichment,
public query, dependency, or collection-completeness behavior is introduced.

## Verification

Unit validation covers domain boundaries, partial dates, duplicates, scoped
credits, quantities, revisions, and normalized external references. PostgreSQL
integration tests cover transactional persistence and rollback, authorization,
concurrent edits, archives, stable component identity, asset constraints, and
same-title lookup. Playwright covers game/release editing, stale drafts,
archives, access control, and narrow dark/reduced-motion layouts on desktop
and mobile projects, alongside console-catalog regressions.

Task verification on 2026-10-17: lint, typecheck, Prisma schema validation,
formatting, all 766 unit/component tests, and 75 targeted game/catalog/core-schema
PostgreSQL tests passed. Browser results are recorded in the development plan.
