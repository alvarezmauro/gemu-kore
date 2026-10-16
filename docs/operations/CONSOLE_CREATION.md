# Console creation

Task 8.4 adds `/app/consoles/new`, linked as **Add console** from the private entry page and collection browser for administrators and editors. Viewers can still browse the collection but cannot enter or submit this flow. The route uses the shared warm-paper controls, responsive shell, restrained Magic Card preview and reduced-motion-aware Blur Fade.

## The flow

1. **Console:** search active platforms by name, alias or brand. Results include available logo, brand, generation and first release year. Search text stays in action POST bodies, not URLs or browser storage. Matches are paged in groups of 25. Enter searches newly typed text; with current results, the Command selector supports keyboard selection.
2. **Model:** choose an active hardware identity within that platform. Exactly one active model is selected automatically only when the complete unfiltered result has one entry. Multiple matches require a choice; a filtered single result is not automatically adopted. Changing platform clears the previous model. The preview separates platform brand from actual hardware manufacturer and shows known model number, year, commercial markets, locking, description and available catalog imagery. Missing artwork has a neutral fallback. Incomplete identities remain explicitly labeled.
3. **Physical details:** optional serial number, observed markings/identification uncertainty, location, nullable box status and private notes. Each initial defect has its own title, description and severity; initial status is Active. Repair history uses the existing defect manager after creation. Location choices show nested paths.
4. **Photos:** select classified local photos, including a mobile camera picker. Supported images are JPEG, PNG, WebP and AVIF, up to 25 MB each. Convert HEIC first. Local previews use temporary blob URLs that are revoked on unmount.
5. **Overrides:** optionally select one custom logo image and one self-contained GLB up to 50 MB. These are personal media roles for this copy; they do not change the shared platform/model or its assets. Selecting another file before saving replaces that pending override. Interactive 3D rendering remains Phase 9 work.
6. **Review:** inspect canonical identity, copy details, separate defects and selected files before choosing **Save console**. Back preserves entered details. New copies always start Private; this form has no publication control.

The existing catalog must contain the intended platform and hardware records. An empty catalog or platform with no active hardware explains what is missing and cannot create a placeholder product. Administrators can add missing identities in the [console catalog](CONSOLE_CATALOG.md). The [reviewed console seed files](../../prisma/seed-data/CONSOLE_COVERAGE.md) remain inputs for a future applicator; opening this form does not import them.

## Saving and recovery

Nothing is persisted while progressing through the steps. Draft text and File objects remain in page memory; leaving or reloading before saving discards them. The wizard limits a batch to 20 photos plus two overrides, with a total of 100 MB. These are browser batch limits; the upload service independently enforces each file's byte, format, pixel and content bounds.

Save creates one `CollectionItem` with its `OwnedConsole` subtype and initial defect rows in one database transaction. Unknown box status stays null, serial numbers preserve leading zeros, and no model/manufacturer/market facts are copied into personal override fields. Creating another physical copy deliberately generates another root identity.

The wizard retains a random copy UUID and the submitted request while awaiting a response. Repeated/concurrent matching requests return the same existing copy only for the authenticated creator and matching model, physical fields and initial defects. They do not edit it or create another copy. A changed request, existing other item or another actor's reference produces a conflict. This is recovery for one in-memory creation attempt, not a general update endpoint or persistent offline draft. If an uncertain save must be retried, keep the page open and retry without changing the request; if details were changed after a save committed, check the collection before starting another attempt.

After the copy is confirmed, files upload sequentially through the existing [asset pipeline](ASSET_UPLOADS.md). Copy creation and object storage are deliberately separate operations: an upload error never claims the copy was rolled back. The saved-copy screen shows each file's transfer/processing state and preserves links to collection, photos and defects. A file failure stops the queue. **Upload remaining files** sends only files that have not been attempted; it does not resend the failed file or create the copy again. **Check upload** uses a validated recovery ID to complete/confirm stored bytes without sending them again. An uncertain response with no recovery ID requires checking saved data before re-adding that file. Keep the page open during recovery; leaving loses the local queue.

Uploaded overrides are activated separately using the completed media-use ID, never an arbitrary asset ID. The service checks that the ready file belongs to this console, matches its IMAGE/MODEL_3D role, remains private and has no conflicting primary selection. Retrying activation is a no-op if already selected. Another existing primary choice is not demoted or overwritten. A completed upload whose activation fails retains its upload ID for explicit checking. New uses remain unapproved for public display. Management/replacement of existing overrides is available on the [console copy page](CONSOLE_CRUD.md) from Task 8.5; ordinary photos can already be managed through the [photo manager](COLLECTION_MEDIA.md).

## Server boundaries

Feature actions obtain request identity on the server and call services. Services own strict validation, current permissions, transactions and safe errors; repositories contain the explicit persistence queries. Selectors require current `collection.manage` without giving editors catalog administration. Create rechecks that permission before and after taking the existing catalog-write and location-hierarchy locks, in that order. Reads use a repeatable-read snapshot; creation uses read-committed after locking. No file receiving, decoding or object-storage work happens in the creation transaction.

Save verifies the selected model belongs to the selected platform, both are active, both reviewed root revisions still match, and a selected location still exists. Catalog corrections or archival invalidate stale selections before anything is inserted. Revisit selection, refresh matches and choose the latest identity while retaining copy details. The catalog write lock serializes this check with administrator corrections/archives. Missing locations produce a specific error and retain the form. Database constraints still enforce the root/subtype relationship.

Queries return narrow selection DTOs and authenticated private image URLs. They omit seed keys, storage locators, audit actors, raw asset metadata and other copies' personal details. Literal bound lookups cannot treat `%`, `_` or SQL fragments as wildcard/injected instructions. Override activation locks the copy, rechecks access and advances its revision after selecting a new private use. Public/approved changes and replacing another primary override are outside this creation endpoint.

## Verification

Use the standard lint, typecheck, unit/component and PostgreSQL suites in [TESTING.md](TESTING.md). The complete creation journey can be exercised against disposable PostgreSQL/MinIO with:

```sh
pnpm test:e2e:access tests/access-e2e/consoles.spec.ts
```

Coverage includes administrator/editor creation, viewer/anonymous denial, expired/revoked/demoted access, bounded active lookups and aliases, empty choices, model-platform mismatch, stale/archive checks, missing locations, strict private fields, separate copies, concurrent retry deduplication, transactional rollback and role-scoped private overrides. Component tests cover local file staging and recovery without recreating a copy. Production desktop/mobile journeys include real image/GLB uploads, keyboard choice, physical details/defects, collection appearance, a deliberately interrupted upload and a 320px dark/reduced-motion review.

Task 8.4 introduced no schema/migration, dependency, seed applicator, public endpoint, existing-console editing/deletion/detail page or 3D renderer. Task 8.5 subsequently adds the [console copy page and editing/deletion](CONSOLE_CRUD.md). The existing photo manager and upload functions retain their compatibility wrappers. Fixtures remain in temporary test services; no personal development catalog records are added.

Verified on **2026-10-15**: **704 unit/component, 428 PostgreSQL integration, 168 authenticated browser and 44 general browser cases pass (1,344 distinct checks)**. The full authenticated regression run passed the 156 existing cases; the final creation-only production run passed all 12 new desktop/mobile cases after keyboard-focus and selector corrections. Lint, TypeScript, formatting, production builds, seed validation, local documentation links and whitespace checks pass. Test services were cleaned up. The local Docker app remains healthy on port 3002 and anonymously visiting the new route redirects to login.

| Flow boundary                 | Evidence                                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Interface and keyboard choice | Production desktop/mobile journeys, review screenshots and 320px dark/reduced-motion check                      |
| Client to server              | Actual selection/save actions and raw image/GLB upload requests                                                 |
| Server to database            | Persisted root/subtype, defects, location and private media/override rows; current permissions and stale checks |
| Storage and completion        | Actual temporary MinIO uploads, ready IMAGE/MODEL_3D assets and private primary overrides                       |
| Response to interface         | Saved-copy receipt, collection card, retained stale inputs and interrupted-upload recovery state                |
