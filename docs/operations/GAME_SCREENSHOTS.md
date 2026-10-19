# Game screenshots

Task 11.4 adds release screenshot management and a private game-detail gallery.
The domain design maps the specification's illustrative `GameScreenshot` entity
to existing `CatalogAsset` uses with role `SCREENSHOT`; no duplicate table or
migration is needed. Source metadata uses existing Asset provenance fields.

## Viewing

`/app/games/[id]` has a Screenshots section separate from personal copy photos.
Ready display images for the selected release take precedence. If none exist,
the gallery explicitly labels inherited game-level screenshots. Other releases'
screenshots are never mixed into the selected release's gallery.

Pages contain up to 16 images with stable order/id pagination. Thumbnails retain
their aspect ratio and link to authenticated image delivery even without
JavaScript. With JavaScript, click a thumbnail to open a focus-trapped viewer;
previous/next buttons or left/right arrows move within the current page. Escape
or Close returns focus to the selected thumbnail. Broken images have a fallback.
The existing Magic UI Blur Fade supplies a small optional entrance effect with
visible server HTML and reduced-motion support; large images do not animate.

Source details include the source type/name, optional source page, author,
license/name/link, attribution, usage restrictions, and retrieved date. Historical
unsafe or credential-bearing URLs are omitted by the server. Only authenticated
private media URLs and explicit presentation metadata enter the gallery DTO;
storage keys, original filenames, hashes, upload manifests and actor IDs do not.

## Administration

Administrators open **Manage release screenshots** from game details or the saved
release catalog editor. `/app/catalog/games/screenshots?releaseId=…` manages that
release's own uses, never inherited game-level uses. Editors/viewers can view
private galleries but cannot open management, mutate uses, or upload catalog files.
Restore an archived release before changing its screenshots.

Upload a JPEG, PNG, WebP or AVIF up to 25 MB through the existing image pipeline.
Caption, image description, source name/URL, author, license details, attribution,
restrictions and a retrieved date can be recorded before uploading. Manually
curated sources and user uploads are supported; this does not fetch from external
providers. Inputs are strict, bounded, and permit only credential-free HTTP(S)
source/license links. Combined caption/source JSON is limited to 1,800 UTF-8 bytes
so the percent-encoded request metadata remains bounded, including non-Latin text.

Source metadata is captured on the original and its image derivatives. It does
not grant rights approval or public safety. Because provenance belongs to shared
assets, source mistakes are corrected by unlinking the gallery use and uploading
a replacement, preserving original provenance. Captions and image descriptions
can be edited independently. Up/down controls reorder screenshots. Confirmed
removal deletes only this catalog-use link, retaining stored files, lineage,
other uses and owned copies.

Uploads show progress. If a response is uncertain, refresh and inspect the gallery
before repeating the file. When an upload ID is available, **Check screenshot
upload** completes/checks the same upload instead of duplicating it. A failed
upload cannot silently overwrite metadata or an existing screenshot.

## Transactions and scope

Screenshot writes require current server-side catalog permission. Final upload
attachment and caption/order/removal transactions serialize with catalog writes.
Uploads append an ordered use, advance the release revision, and write manual
history exactly once, including on completion retries. Other changes require the
reviewed release revision, preserve stale drafts, and record manual history.
Caption/order changes reset changed uses' public approval fields. Deletion locks
the referenced assets and removes the link without deleting bytes. Storage and
image decoding remain outside database transactions. Existing public projections
and approval workflows are unchanged.

This task adds no providers, trailer player, playtime, component tracking, new
dependencies or schema migrations. Personal photos retain their existing workflow.
Tests cover validation/manifest round-trips, attribution and URL safety, paged
fallback, revisions/roles, ordering, approval resets, rollback, retained assets,
real PostgreSQL/MinIO ingestion and retries, keyboard/focus navigation, narrow
dark/reduced-motion layouts, and game CRUD regressions.

Verified 2026-10-19: lint, typecheck, changed-file formatting, production build,
800 unit/component tests, 25 targeted PostgreSQL tests, 31 PostgreSQL/MinIO asset
tests, six screenshot browser scenarios and six game CRUD regression scenarios
across desktop/mobile Chromium. The browser run exposed a save/reorder refresh
race; controls now wait for refreshed server revisions, and all screenshot cases
passed against a fresh production build. Desktop and narrow dark/reduced-motion
screenshots were visually reviewed.
