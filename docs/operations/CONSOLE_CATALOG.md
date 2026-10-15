# Console catalog — Task 8.1

Implemented 2026-10-15. The administrator workspace is `/app/catalog`, available from **Manage console catalog** on the private home page. It manages the existing Company, Region, ConsolePlatform, ConsoleModel and ExternalReference tables. There is no schema migration or new dependency.

## Workflow and domain boundaries

Create companies and commercial markets first, then platforms and hardware models. Each section supports create, edit, archive and restore. Lists show 25 records per page with active/archived/all filters and stable name/ID ordering. Relationship pickers search active records by name through authenticated server actions, returning at most 25 matches; refine the name to find later records. There is no arbitrary first-page-only selection cap. Models can have up to 30 market links and supported catalog targets up to 30 external references.

- A platform describes the general system. Its company is the brand/manufacturer relationship already defined by the core model.
- A model describes physical hardware and requires one platform. Its actual manufacturer is optional and never filled automatically from the platform brand. Model number is not a globally unique identity.
- Regions are reusable commercial markets, displayed as **Markets**. Empty model coverage remains unknown; it does not become Worldwide. Region-lock behavior is an independent nullable enum. Video standards and languages belong in specifications rather than this market vocabulary.
- Model specifications are optional bounded JSON objects. The form edits the data object; the service stores `{schemaVersion:1,data:{...}}`. Empty input becomes SQL NULL. Measurements use positive decimal values with up to three fractional digits, within the existing database precision. Year ordering is checked before persistence.
- Companies expose their existing country-code, founded-year, website and aliases fields. Platforms expose generation, years, description, history and aliases. No separate manufacturer table or universal catalog superclass is introduced.
- Shared corrections affect linked canonical identities. They never alter personal notes, serial numbers, defects, photos, owned-copy records, publication choices or owned revisions. No owned console is created by catalog forms.

Archiving preserves IDs, history, existing relationships and owned copies. Archived records are excluded from new relationship searches. Existing archived links can be retained during corrections, removed or replaced; a different archived dependency cannot be newly attached. Restore re-enables the record itself; it does not recursively restore dependencies. Editing an archived record requires restoring it first. Hard deletion is deliberately absent: retained metadata history and shared references already restrict canonical deletion.

## External references and provenance

Company, platform and model forms manage explicit-target references as part of one aggregate save. Region is not a supported ExternalReference target in the approved core schema. Game/accessory references remain outside this task.

A reference has a normalized lowercase provider and either an external ID, an HTTP/HTTPS URL, or both. IDs require a provider object type. URLs must have no embedded credentials. The original trimmed URL is retained; its normalized identity uses WHATWG URL serialization and removes the fragment, preserving case-sensitive paths and query ordering. No URL is fetched, rendered as third-party media or passed to an enrichment provider.

The service rejects duplicate reference identities and foreign reference IDs. Existing reference IDs and provider metadata survive edits. Removed references remain represented in immutable aggregate history. Provider metadata, target FKs, normalized URLs, seed keys, actor IDs and revision values are never editable fields. Client values cannot select arbitrary persistence fields or entities.

Every applied field change is written to MetadataChange in the same transaction as its canonical mutation, with server-selected field paths, before/after JSON, current actor, origin MANUAL and the resulting root revision. Initial nonnull facts are also recorded. Market links and references are audited under the model/canonical root. Null-to-null facts do not create history rows. Unchanged saves may advance the revision without adding semantic field changes. The page shows the newest 50 field changes; older changes remain stored. Audit actors and source snapshots are not sent to the browser.

## Authorization and consistency

The page, lookups and all mutations independently require current `catalog.manage` permission, which is ADMIN-only. Editors and viewers retain existing read-only canonical lookup behavior in private collection search; that does not authorize catalog administration. Anonymous requests return to login, other private roles are denied, and private service failures use safe messages.

Services own transactions and validation; repositories own explicit Prisma queries and receive the transaction. Reads use repeatable-read snapshots. Strict schemas bound names, text, reference lists, market lists, JSON size/depth and pagination. Lookup text travels in server-action POST bodies, never local storage or search URLs. DTOs select only needed catalog fields and omit seed keys, storage information, personal-copy data and audit actors.

For this small shared catalog, administrator writes share a transaction-scoped PostgreSQL advisory lock `(71482,1)`. A three-second local lock timeout bounds contention. Current permission is checked before and after acquiring it. A supplied expected root revision is compared after the lock; a concurrent edit, archive or reference/market change makes the older submission fail without changing anything. The lock serializes dependency checks and archival across this feature's write paths. Future seed/provider writers must use this service/locking and revision contract rather than bypassing it. There is no network work inside mutation transactions.

Reference identity swaps temporarily use distinct internal provider keys inside the transaction to satisfy immediate uniqueness constraints. The final validated identities and audit write commit together; any failure rolls everything back. No temporary identity is visible outside the transaction. Existing provider metadata is preserved.

Forms retain entered values on validation, conflict, stale or network errors and direct focus to the error. A stale form is never automatically retried against a newer revision: reload to review the latest facts. Pending submissions are guarded; archive/restore has an explicit dialog with keyboard focus restoration. Layout uses shared semantic tokens and shadcn controls, with no decorative motion or extra UI library.

## Verification and scope

Coverage includes strict input/JSON/URL validation, all four canonical concepts, administrator-only access, expired/revoked sessions, permissions changing during a write wait, concurrent stale edits, atomic audit rollback, owned-copy preservation, archive/restore, active/retained archived dependencies, reference ownership/identity swaps/metadata preservation, literal lookup text, bounded paging/history, and browser workflows on desktop and mobile.

No seed format/data, bulk import, provider adapter, enrichment, catalog asset editor, game/accessory CRUD, owned console creation/detail/CRUD, public catalog endpoint or 3D renderer is included. Those remain separate roadmap work. The existing nonfailing PostgreSQL adapter deprecation warning is unchanged.

Final verification: 623 unit/component cases, 415 PostgreSQL cases, 156 authenticated browser cases and 44 general desktop/mobile browser cases pass (1,238 distinct checks). The full authenticated regression run passed its 144 existing cases; a final catalog-only production run passed all 12 new cases after two selector corrections. Lint, typechecking, formatting, production builds, documentation-link and whitespace checks pass. The local Docker app, PostgreSQL and private MinIO remain healthy; the new catalog route compiles and redirects anonymous requests to login. Disposable test services were removed and no personal catalog fixtures were created.
