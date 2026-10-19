# Owned game management

Task 11.3 provides private copy details at `/app/games/[id]`. Creation remains
at `/app/games/new`. Collection grid/list cards, search results, the command
palette, and successful creation link to the exact physical copy.

## Viewing

Every currently authorized private reader can view a copy. Administrators and
editors can change any copy in this shared collection; creator identity is audit
information. Viewers receive no write controls. Anonymous visitors go to login,
denied identities go to access denied, and malformed, missing, or non-game IDs
receive not found. Page metadata stays generic.

The page separates My copy from About and Release and expected contents. It
shows copy observations, location, tri-state box possession, notes, structured
defects, personal photos, developer/release-company credits, partial market
dates, languages, region locking, and expected components. Archived canonical
records remain readable. A primary ready release cover takes precedence over
the primary ready game cover. Images use authenticated private delivery with
an unavailable-image fallback; storage keys and provenance internals are not
serialized into the page.

The detail preview includes up to 20 defects and 12 personal photos. Existing
Defects and Photos pages provide complete copy-scoped viewing/management.
Expected contents do not assert actual component presence or completeness.

## Editing

**Edit game** changes serial number, observed markings, location, box possession,
and private notes. Leading zeroes are preserved; empty values become null.
Defects and photos retain their separate management flows.

**Correct release identification** explicitly searches active platforms,
titles, and releases, with optional market/edition filters. Selecting another
release updates only this copy's relationship. Canonical market/edition are
never personal overrides; notes, photos, defects, and location remain attached
to the copy. The current archived identity may be retained, but switching to
an archived release or one with archived parents is rejected. Catalog revisions
must match the reviewed records.

The form captures the root revision when opened. A concurrent copy, defect, or
media change rejects a stale edit and preserves the draft with a focused error.
Close, refresh, and reopen to review current state. Unknown responses require
refreshing before retrying. Unchanged submissions do not advance the revision
or publication state. Meaningful edits increment the revision, record the actor,
and return a published item to Private, clearing publication attribution/time.

## Deletion and integrity

**Delete game** requires an explicit confirmation with the captured revision;
cancel restores trigger focus. A successful transaction removes only the
selected CollectionItem, its OwnedGame subtype, defects, and media-use links.
Other copies, canonical records, expected components, stored Asset rows, bytes,
and provenance remain. It never performs storage deletion or garbage collection.
A failed transaction rolls back all dependent deletion.

Services enforce strict inputs and server authorization, rechecking permission
after acquiring locks. Lock order matches creation and console management:
catalog guard, location hierarchy, copy root, then associated assets in sorted
order for deletion. Shared root revisions prevent lost updates across copy,
defect and media operations. Transactions contain no file transfers or external
provider calls. Public projections and publication controls are unchanged.

## Scope and checks

This task completes owned-game create/read/update/delete using the existing
schema and creation flow. Task 11.4 subsequently adds
[screenshots and source metadata](GAME_SCREENSHOTS.md). Task 11.5 adds
[structured trailer references and deferred playback](GAME_TRAILERS.md). Task 11.6
adds [sourced playtime estimate sets](GAME_PLAYTIME.md). Providers, enrichment and component-presence/3D features stay
in their scheduled tasks. The original CRUD task added no dependencies or migrations.

Unit checks cover strict edit/delete validation, exact-copy links, preserved
draft/revision behavior, and confirmation submission. PostgreSQL checks cover
safe bounded DTOs, scoped credits and cover fallback, archived relationships,
revision races, changed authorization, publication/no-op behavior, atomic
rollback, and isolated deletion with shared assets. Browser checks exercise
editing, release correction, photo/defect retention, stale edits/deletion,
confirmation cancellation/focus, viewer access, not found, and narrow dark
reduced-motion layouts alongside game creation and console CRUD regressions.

Verified 2026-10-19: lint, typecheck, changed-file formatting, production build,
788 unit/component tests, 55 targeted PostgreSQL integration tests, and 30
distinct desktop/mobile Chromium browser scenarios. One mobile creation test
initially attempted a link in closed navigation; after correcting the test to
open the navigation, that scenario passed on both projects. Desktop light and
320px dark/reduced-motion screenshots were visually reviewed.
