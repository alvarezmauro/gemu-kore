# Command palette

Task 7.3 adds **Quick search** throughout the authenticated workspace. Open it with **⌘K**, **Ctrl+K**, the private entry page's Quick search button or the search icon in the workspace header. The implementation adapts the [shadcn Command](https://ui.shadcn.com/docs/components/radix/command) source to the existing Radix Dialog, semantic tokens and 44px controls. `cmdk` **1.1.1**, the primitive used by shadcn Command, is the only added dependency and is pinned in the lockfile.

## Interaction

Opening focuses the search field. Arrow keys move through options; Enter selects; Escape, the close button or clicking outside dismisses the palette. The shortcut also toggles an open palette. Dismissal restores focus to the opener where it still exists. Modified/repeated/composing shortcuts are ignored, and the shortcut does not interrupt another open form dialog or navigation sheet.

An empty field offers shortcuts to the existing collection entry, collection browser, search, locations, defects and photo pages without a database search. Typing filters those page labels and starts the private search after two characters and a short debounce. Results are grouped into **Consoles**, **Games**, **Accessories** and **Catalog**, with empty groups omitted. The groups retain server relevance order. Subtle Blur Fade presentation uses the existing static-first, reduced-motion-aware wrapper; keyboard navigation and content visibility do not depend on animation.

Selecting an owned result shows an identity preview and actions for **View copy photos** and **View copy defects**. These open the existing manager using that exact `CollectionItem.id`. Identical copies remain separate and show short copy IDs. Selecting a catalog result shows its canonical type and identity in the palette, with **Back to results**. A catalog record is not presented as an owned physical copy, and no link to an unimplemented catalog or owned-detail page is fabricated. Incomplete product identities are labeled in the preview.

The palette works on `/app`, `/app/collection`, `/app/search`, `/app/locations`, `/app/defects` and `/app/media`. Task 7.5 adds the collection browser and its Go to shortcut. An authenticated private layout owns the provider and single shortcut listener. Pages supply their header trigger through the shared shell's optional `headerActions` slot; generic UI does not import feature modules. Public/design-preview, sign-in and access-denied pages do not mount the provider or expose its trigger.

## Search scopes

Owned results reuse the Task 7.2 [collection search](SEARCH.md), including cross-field AND, aliases, companies, editions, markets, literal serial/product codes, notes, defects and private repair notes. Each physical copy appears once. Existing collection search behavior and its independent full-page endpoint remain intact.

Catalog lookup is a separate, bounded private use case. It searches each canonical record's own name/aliases/model number/edition/color/printing label/code, where those fields exist, using the existing indexed full-text, prefix and bounded trigram expressions. The types are Company, ConsolePlatform, ConsoleModel, Game, GameRelease, Accessory, AccessoryVariant and Region. Display context resolves parent identity names; those displayed parent names do not expand the catalog record's matching scope. For example, a game title finds the Game record; a release's printing label finds its GameRelease. Catalog lookup does not perform the owned graph's cross-relationship company/market matching or serial/note/defect lookup.

Unowned catalog identities can appear in Catalog, independently of owned hits. Archived canonical records are omitted from Catalog; models/releases/variants also require their identity parents to remain unarchived. Collection results retain archived identities already referenced by an owned copy. Each catalog target is explicitly `(kind, id)`, never an unchecked collection-item ID. The response contains only title, context, kind, UUID and identification status; it excludes history, descriptions, evidence, technical JSON, provenance and private copy fields.

The palette requests up to 20 owned results and 10 catalog results, each with an independent `hasMore` flag determined using one extra row. Where more exist, it asks for another word. This is a quick lookup, not a new paginated collection view. Task 7.4 implements [URL filters and sorting](FILTERS_AND_SORTING.md) on the full search page; palette queries stay independent of those controls. [Grid/list views and full-page pagination](COLLECTION_VIEWS.md) are implemented by Task 7.5; catalog CRUD remains in its assigned phases.

## Transport and access

`POST /api/search/palette` accepts only a strict `{ "q": "..." }` JSON object. Limits, validation, same-origin checks, body deadlines, private no-store headers and redacted failures reuse the existing search transport. Client-supplied audience, permissions, limit and offset are rejected. There is no GET handler or public palette endpoint.

The service requires current `private.read` for ADMIN, EDITOR or VIEWER before validation and again inside one repeatable-read transaction. Collection and catalog queries execute sequentially on that transaction's single PostgreSQL connection, sharing the same access snapshot and transaction-local two-second statement timeout/word-similarity setting. Catalog reads reuse existing expression indexes and require no migration, synchronization job or external engine. Committed catalog edits become searchable on the next request.

Search text travels in the POST body and is not placed into result links, browser storage or application logs. Notes and serial values are not echoed in DTOs. The browser validates both result scopes, cancels obsolete requests and ignores late responses. A shared hook provides this behavior to the palette and full-page search. Closing unmounts the search session, aborts pending work and forgets private input/results; reopening starts empty. No recent-query history or persistent result cache is introduced.

Errors retain the field for correction or explicit retry. Invalid client input never starts a request or enters an endless retry state. Revoked access clears obsolete results on the next request and returns a sign-in instruction; navigation/actions independently retain their existing server access checks. A previously authorized response already displayed cannot be retroactively undisclosed by a later grant change.

## Verification

The unit/component tests use the actual Command/Dialog primitives to check shortcuts, focus restoration, keyboard actions, canonical versus copy selection, valid/invalid retries, close cancellation and stale responses. Client/schema cases verify strict typed results and private POST transport. Existing full-page search component tests also exercise the extracted request hook.

PostgreSQL tests use real migrated disposable databases and signed sessions to verify all eight catalog kinds, all read roles, unowned and archived boundaries, live edits, deterministic bounds, private-field exclusion, strict transport, revocation and redacted failures. Complete-query plan cases also run the palette service and catalog `EXPLAIN` on the existing 3,004-copy fixture, including selective names/typos, multi-source terms, common words and short prefixes.

Browser journeys use actual production routes, real test sessions and disposable PostgreSQL/MinIO. They exercise both shortcuts on all five workspace pages, grouped copies/catalog, identity previews, exact-copy actions, arrow/Enter selection, focus trapping/restoration, outside dismissal, private POST bodies, input reset, validation/empty/retry states, access revocation, an existing form dialog, public/denied boundaries and a 320px dark/reduced-motion layout. See [TESTING.md](TESTING.md) for final results and run commands.

| Boundary            | Verified evidence                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| UI → request        | Typing sends a strict JSON POST to the bare palette endpoint; idle and closed palettes do not search.    |
| Request → access    | Actual signed sessions/current grants permit all three read roles and reject anonymous/revoked access.   |
| Service → database  | The real PostgreSQL queries return separate owned IDs and typed canonical identities in one transaction. |
| Database → response | Narrow schemas exclude private excerpts and prevent catalog IDs from masquerading as copy IDs.           |
| Response → UI       | Desktop/mobile groups, previews and exact-copy actions work with keyboard and pointer controls.          |

Verified on 2026-10-15: **527 unit/component, 361 PostgreSQL and 152 browser cases pass (1,040 checks)**, plus lint, types, formatting, production browser builds and whitespace validation. Desktop/mobile and 320px dark screenshots were inspected. The local Docker app was refreshed to install the pinned dependency and is healthy at port 3002; anonymous private access still redirects to sign-in and the palette endpoint returns private no-store 401. Existing local OAuth providers remain unconfigured; authenticated behavior uses the isolated production browser runner. No database migration or personal collection fixture is required. Next: Task 7.4 — Filters and Sorting.
