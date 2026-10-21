# Accessory copies

Task 16.2 adds `/app/accessories/new` and `/app/accessories/[id]`. Collection cards, collection search and the command palette open the copy page. Editors and administrators can create and manage copies; viewers can read them. Every query/action revalidates private access and mutations recheck current collection permission after acquiring locks.

## Selecting and creating a copy

Choose a catalog accessory family and a variant, then enter personal physical details. The selected variant supplies producer, model/color/edition, release year, commercial markets and explicit platform compatibility with notes. Missing markets and compatibility remain selectable and visibly unknown. They are never inferred from one another or written on the owned copy. Administrators can open the existing catalog editor in another tab; editors request missing catalog entries from an administrator.

Personal data uses the shared copy validator: serial number, observed markings, location, nullable has-box, private notes and up to 20 structured initial defects. Has box is separate from completeness. The four-step form keeps personal entries and selected files when navigating back or explicitly refreshing catalog choices. Refreshing an identity returns to personal details for review.

Creation uses one client-generated save reference and a frozen submitted snapshot. Repeating the same save after a lost response returns the existing matching copy. Reusing the reference for different data or another actor fails instead of creating a duplicate. Fresh creation checks both catalog revisions, family/variant relationship, archive status and location. A successful retry may retain the same relationship after catalog revisions or archives advance. Root, matching owned subtype and initial active defects commit atomically, private by default.

## Editing and deleting

The basic copy page displays its identity, physical fields, location and the first 20 defects with a total. It links to the existing scoped Photos and Defects workspaces. The edit dialog snapshots the copy revision on opening. A concurrent change produces an error without replacing the draft. Catalog refresh only changes selected canonical facts; it cannot silently update the copy's expected revision. Retained archived identities remain editable with current revisions; switching to a different identity requires active family and variant records.

No-op physical edits preserve revision and publication. Meaningful edits advance revision and return a published copy to private. Variant correction preserves defects and personal media. Delete requires explicit confirmation and an expected copy revision. It removes only that collection root, its owned child, defects and media links. Shared catalog, other copies and stored assets remain intact.

Writes follow the existing lock order: catalog, location hierarchy, collection root when present, then relevant assets. Authorization, validation, revision checks and writes stay inside the service transaction; repositories perform persistence only. Cache invalidation follows a confirmed transaction result.

## Photos and custom models

The creation form stages up to 20 files, at most one initial model and 100 MB total. Photos reuse existing classifications and image validation. Models must be self-contained GLB files up to 50 MB and pass the existing server validator. No file is uploaded before the copy is saved.

Uploads run sequentially and stop on the first failure. The saved copy and confirmed uploads remain available. A known upload reference can be checked through the existing completion endpoint; an uncertain request is never automatically resent. Remaining waiting files require an explicit action. Reloading discards browser-local file selections.

The copy page supports private model upload, download, selection, catalog fallback and removing a model link. Upload does not automatically select a model. Selection is scoped to ready model uses on this accessory and resets publication approval on changed bindings. Model writes advance the copy revision and unpublish meaningful changes. Lists show 25 models per page; the selected model remains visible even on another page. Removing the selected use restores catalog fallback and preserves stored bytes. Failed or uncertain uploads require checking/refreshing saved files before choosing a file again.

## Scope and verification

This task adds no schema, dependencies, provider or public endpoint. The richer catalog imagery, information, video and interactive 3D presentation are documented in [Accessory detail](ACCESSORY_DETAIL.md) (Task 16.4). Enrichment is documented in [Accessory enrichment](ACCESSORY_ENRICHMENT.md) (Task 16.3). Existing media delivery and public privacy rules remain authoritative.

Checks use synthetic catalog records and disposable PostgreSQL/MinIO. The personal development database is not migrated. Verification passes: lint, typecheck, production builds, formatting/whitespace, 1,247 unit/component cases, 158 distinct relevant database cases and 26 distinct desktop/mobile browser checks across full and focused runs. The deferred 3D bundle is unchanged and within budget. Reviewed light desktop, dark mobile, reduced-motion and 200% text-size screenshots. The shared header and accessory controls wrap at narrow widths; save/cancel remain reachable. Final task status is recorded in the development plan.

Implementation: [validation](../../src/features/accessories/copy-validation.ts), [service](../../src/server/services/collection/accessory-copies.ts), [repository](../../src/server/repositories/collection/accessory-copies.ts), [creation form](../../src/features/accessories/components/accessory-wizard.tsx), [copy page](../../src/features/accessories/components/accessory-copy.tsx), [database tests](../../tests/integration/accessory-copies.test.ts), [browser tests](../../tests/access-e2e/accessory-copies.spec.ts).
