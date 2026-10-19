# Game creation

Task 11.2 provides `/app/games/new`, linked from the collection home and browse
page for administrators and editors. Viewers cannot load or submit the flow.

## Manual flow

1. Select a platform from the active catalog.
2. Search/select the game title. Aliases and slugs are searchable; slugs
   distinguish titles with the same name.
3. Optionally filter releases by commercial market and edition, then select a
   release for this platform and title. An unfiltered search includes releases
   with unknown markets. Filters narrow choices; they never override release
   identity on the copy.
4. Enter serial number, observed markings, location, tri-state box information,
   private notes, separate defects, and optional personal photos.
5. Review canonical identity, expected contents, copy details, defects, and
   selected photos before explicitly saving.

Administrators can explicitly open **Create missing release**, which reuses the
catalog editor with the selected title/platform fixed. Saving that form creates
only the shared release. **Use created release** reads it back through the
server, retaining copy details already entered. Administrators may also open
the game catalog in another tab to add a missing title, then refresh the title
search. Editors select existing catalog records.

The selected release supplies markets, edition, printing, partial market dates,
languages, identification, region lock and expected components. Expected contents
do not assert actual copy presence, and box possession does not imply completeness.

## Saving and photos

Server services validate strict inputs, recheck active catalog relationships and
revisions, validate the location, and enforce collection-management permission
again after acquiring the shared catalog and location locks. The collection
item, OwnedGame relationship, and initial active defects commit atomically.
Copies always start private. Creation never writes canonical metadata.

A client-generated copy ID makes retries idempotent. A matching retry by the same
actor returns the existing copy; reuse with different copy details or a different
actor fails. Distinct IDs allow multiple physical copies of the same release.
Catalog changes detected before creation preserve the draft and require refreshed
selections. An uncertain response retains the same ID and submitted payload.

Photos remain browser-local until the copy is saved. Uploads use the existing
private collection-media pipeline, with progress, sequential upload, and a stop
on failure. The copy remains saved if a photo fails. Uploads with an acknowledged
upload ID can be checked; remaining photos can resume. An uncertain photo must
be checked in Photos before uploading it again. Leaving/reloading the form drops
unsaved draft fields and local file selections.

## Scope and verification

This task adds creation only. Task 11.3 subsequently adds owned-game
[viewing, editing and deletion](GAME_CRUD.md); canonical screenshot galleries,
trailers, playtime, providers,
enrichment, and component-presence tracking remain their planned tasks. No new
dependencies or schema migrations are required beyond Task 11.1.

Validation tests cover copy/canonical boundaries, unknown values, strict inputs,
limits, and optional filters. PostgreSQL tests cover literal and paginated
searches, release filtering, canonical identity checks, archives/revisions,
authorization changes, transaction rollback, and concurrent retries. Browser
tests cover editor creation with a personal photo, explicit admin release
creation, stale-draft recovery, failed uploads, access, empty choices, keyboard
focus, and narrow dark/reduced-motion layouts on desktop/mobile Chromium.
