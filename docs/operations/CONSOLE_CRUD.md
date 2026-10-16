# Console copy management

Task 8.5 completes owned-console CRUD. Create copies through the existing [creation wizard](CONSOLE_CREATION.md). Open **View console** from a collection card/list row, a search result, the command palette's owned-console preview or the saved-copy receipt. `/app/consoles/[id]` uses the physical copy's `CollectionItem` ID, not its canonical model ID. Multiple copies of the same model remain independent.

## Reading and editing

Every currently authorized private reader can view a copy. Administrators and editors can edit or delete any copy in this shared collection; the creator is audit information, not an ownership permission. Viewers see no write controls. Anonymous visitors go to login, denied identities go to access denied, and missing/non-console IDs receive a not-found response. Page metadata is generic and private media continues through authenticated delivery.

The page separates **My copy** (serial, observed markings, box status, location path and private notes) from **Catalog identity** (platform, model, platform/model manufacturers, commercial markets, locking, lifecycle facts, known specifications, descriptions and history). Unknown facts stay unknown; incomplete and archived identities are labeled. Box status does not imply completeness. Catalog and personal galleries are separate. Defects show individual severity/status and repair notes; no recorded defects does not imply inspection.

**Edit console** changes copy fields. Leading zeros in serials are retained; empty notes/markings and unassigned locations become null. **Correct model identification** explicitly chooses an active platform and model using the existing paged selectors. It changes only this copy's model relationship, preserving its notes, photos, defects and location. The current archived model/platform can remain assigned; switching to another archived identity is rejected. Existing copy artwork/GLBs also stay attached when correcting the model. Canonical manufacturer, markets, model facts and assets cannot be injected into this form or action. Catalog administration remains separate.

An edit form captures the copy revision and both reviewed catalog revisions when opened. Saving locks and checks the current records, including the selected location. If another tab, a defect edit, a completed media change or a catalog correction invalidates that review, the service refuses the stale submission and keeps the draft visible. Close the form, refresh the console, and review the latest facts before editing again. It never quietly retries the old draft against a new revision. A normalized no-op preserves the revision and publication; a meaningful edit advances the root revision/actor and conservatively returns a published copy to Private, clearing its publication metadata. This page does not publish copies.

## Photos, defects and artwork

Use **Manage copy photos** and **Manage copy defects** for the existing [photo](COLLECTION_MEDIA.md) and [defect](DEFECTS.md) managers. Viewers have corresponding read links. The detail page shows at most 12 personal images, 12 catalog images and the first 20 defect records, with links to the complete managers. Catalog images are a bounded preview.

A selected copy logo takes precedence over the model logo, then the platform logo. A selected copy GLB takes precedence over the model GLB, then the platform GLB. The preview labels where each effective file comes from. Missing/broken images have a neutral fallback. Ready 3D files can be downloaded privately; interactive rendering belongs to Phase 9.

In **Copy artwork and 3D file**, upload a supported logo image up to 25 MB or a self-contained GLB up to 50 MB through the existing private upload pipeline. The server validates the actual bytes. After uploading, wait for the refreshed list, then explicitly choose **Use for this copy**. Uploading alone does not replace an existing selection. **Use catalog logo/3D file** clears the primary copy selection and restores catalog fallback. **Remove [filename]** asks for confirmation and deletes only that copy's media-use link; its stored asset remains. Replacing/clearing a primary selection resets approval on changed uses. These changes advance the copy revision and return a published copy to Private.

Image derivatives use the original uploaded filename from their recorded source, without returning that source record or storage locator. Long names wrap inside cards and confirmation controls. Custom-use history is paged in groups of 25 (maximum page 1,000); current primary selections also remain visible when outside that page. No form accepts an arbitrary asset ID: only a completed, ready use attached to this copy, with a matching custom role and asset kind, can be selected. Ordinary photo links and other copies' override links cannot be changed through these controls.

Progress is shown during upload/processing. An uncertain response blocks another upload until **Refresh saved files** is used to inspect the current list. When a validated upload reference is available, **Check upload** can complete the existing upload without resending bytes. Recovery never creates another console. Leaving the page loses a pending local File selection.

## Deletion

**Delete console** opens an explicit confirmation identifying the platform/model. Cancel returns focus to the trigger. Confirmation retains the revision reviewed when it opened; a concurrent change prevents deletion until the user refreshes and reviews again.

A successful delete removes the selected `CollectionItem`, its `OwnedConsole` subtype, defects and media-use links atomically. Other copies, catalog identities/relationships, catalog assets, stored Asset rows, bytes and provenance remain. This action does not run object-storage deletion or garbage collection. A failed transaction rolls the deletion back. After success the browser returns to the collection; the removed detail URL becomes not found.

## Server boundaries

Server Actions obtain verified identity, services validate strict input/current permissions and coordinate transactions, and repositories perform explicit persistence queries. Detail reads use a repeatable-read snapshot and safe DTOs, omitting storage keys/namespaces, provenance internals, seed keys and audit actors. Only the fields needed by each interactive control cross its client boundary. Serial numbers and private notes are carried in action bodies, not URLs or local storage.

Mutation lock order is catalog write guard, location hierarchy, copy root, then the copy's asset IDs in sorted order when changing media or deleting. Access is checked again after waiting for locks. The root revision shared by console fields, defects and media prevents lost updates. Deletion locks associated private/public-display assets before cascading use removal to avoid inconsistent asset lock ordering. Transactions contain no file transfer, decoding or object-storage work. PostgreSQL root/subtype, use-kind and primary-use constraints remain authoritative. No schema, migration, dependency, seed import, public projection or 3D renderer is introduced.

## Verification

Use the standard [testing guide](TESTING.md). The focused production browser journey runs against disposable PostgreSQL and MinIO:

```sh
pnpm test:e2e:access tests/access-e2e/console-crud.spec.ts
```

Integration cases cover shared-editor access, viewer denial and grant demotion, unknown/non-console IDs, separate copies, strict fields, stale catalog/location/copy revisions, concurrent writes, archival, re-identification, no-op publication behavior, fallback precedence, scoped override selection/removal, pagination, retained stored files and rollback. Component cases cover frozen open-form/confirmation revisions, retained stale drafts, explicit deletion and upload recovery without resending or auto-selecting a file.

Desktop/mobile journeys exercise actual collection/search links, edit/model correction, two-tab conflicts, cancel focus and deletion, image/GLB upload and authenticated download, explicit selection/clear/removal, uncertain-upload recovery, private/read-only access and 320px dark/reduced-motion detail. Fixtures are restricted to disposable test services; personal development data is not populated.

Verified on **2026-10-15**: **709 unit/component, 444 PostgreSQL integration, 180 authenticated browser and 44 general browser cases (1,377 distinct checks)** pass across the regression and focused runs. The full integration run passed 443 cases; the final console-only run passed all 29 cases, including the added derivative-filename regression (444 distinct database checks overall). The full authenticated run passed all 168 pre-existing cases; the final console-only production run passed all 12 new desktop/mobile journeys after fixing derivative filename display and test selectors for not-found/route-announcer behavior. Typechecking, lint, formatting, production browser builds, seed validation, documentation links and whitespace checks pass. Disposable PostgreSQL/MinIO and test servers were cleaned up. The personal development app remains healthy on port 3002, with no test fixtures added to its database.

| Flow boundary        | Evidence                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| UI and navigation    | Actual collection/search links, private detail, edit dialog, screenshots and 320px checks                          |
| Client to server     | Real edit/delete/override actions and raw upload requests; retained stale draft and focused error                  |
| Server to database   | Corrected identity and private fields, isolated sibling copy, root revisions, cascading copy-only deletion         |
| Storage and delivery | Real disposable MinIO image/GLB uploads, source filename, authenticated GLB bytes, retained assets after unlink    |
| Response to UI       | Refreshed copy fields and effective overrides, catalog fallback, cancel focus and collection redirect after delete |
