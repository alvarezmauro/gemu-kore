# Game trailers

Task 11.5 adds structured YouTube and direct-video references to private game
details. Administrators use **Manage trailer** on a saved game/release catalog
record, or **Manage release trailer** on a game copy. The editor lives at
`/app/catalog/games/trailer?kind=game|release&id=<catalog UUID>`.

## Catalog scope and editing

- A game trailer is the default for its releases. A release trailer replaces the
  entire default reference. Removing the release reference restores fallback;
  trailers from other releases are never used. The detail page labels the scope.
- Choose YouTube and enter its video ID or a recognized HTTPS watch, share,
  shorts or embed link. Only the validated 11-character video ID is stored.
  Playlist URLs and arbitrary iframe HTML are rejected.
- Choose Direct video URL for an HTTPS URL without credentials, up to 2,048
  characters. Browser-supported files such as MP4 and WebM can play through
  native video controls. The server does not fetch, probe, download or proxy
  external videos. Hosting, codec support and continued URL availability belong
  to the source. Expiring signed URLs will need a reviewed replacement.
- Save an empty reference to remove that scope's trailer. Save explicitly to
  replace an existing reference. Owned-copy observations and revisions are not
  changed by catalog trailer edits.
- Only ADMIN can read the editor or mutate canonical trailers. EDITOR and VIEWER
  can play trailers on private copy details. Mutations validate strict payloads,
  recheck current authority after the catalog write lock, reject archived records
  and stale revisions, increment the root revision, and append manual metadata
  history in the same transaction. Failed edits retain the form draft. Controls
  stay disabled through the saved-revision refresh.

## Player behavior

The page initially contains an external source link and a **Load trailer**
button. No provider thumbnail, iframe, video request or provider SDK loads on
page entry. Without JavaScript, the external source link remains available.
The player module loads on request. YouTube uses a fixed
`youtube-nocookie.com/embed/<validated ID>` URL with inline playback and native
provider controls. Its referrer policy sends only the application origin across
origins, rather than a private copy URL. See the official
[YouTube player parameters](https://developers.google.com/youtube/player_parameters)
and [privacy-enhanced embedding guidance](https://support.google.com/youtube/answer/171780?hl=en).

Direct video uses native controls, `playsInline` and `preload="none"`. Neither
player requests autoplay, looping or decorative motion. Closing unloads the
media; the toggle retains focus. The responsive layout supports 320px widths,
dark mode, keyboard use and reduced motion. Direct video errors show a visible
message; the original source link remains available for unsupported codecs,
source failures and embedding restrictions. YouTube playback restrictions may
be shown inside its player, so an external fallback remains visible throughout.
Captions depend on the external provider/file; no caption track is invented.

## Schema and deployment

`Game` and `GameRelease` each store `trailerProvider` (`YOUTUBE` or `DIRECT_URL`),
nullable `trailerId` / `trailerUrl`, and `trailerPublicApproved` (default false).
Database checks enforce complete provider-specific groups and prevent approval
without a reference. Service validation additionally normalizes HTTPS URLs and
rejects credentials. Replacements and removals clear approval; no-op saves
preserve it. Manual history records the old/new whole reference and actor.
There are no fabricated Asset rows for remotely hosted video.

Apply `20261019120000_game_trailers` through the normal migration workflow before
running the updated application:

```sh
pnpm db:deploy
pnpm db:generate
```

Implementation verification uses disposable PostgreSQL and browser fixtures,
without migrating or changing personal development data. This task does not
expose public trailer queries or public-approval controls. Future public
projections must enforce public settings, item visibility and trailer approval.
Provider imports, enrichment, uploaded-video ingestion and playtime remain in
their assigned tasks. No dependency or environment variable is added.

## Verification

```sh
pnpm lint
pnpm typecheck
pnpm test --maxWorkers=2
pnpm test:integration tests/integration/game-trailers.test.ts tests/integration/game-crud.test.ts tests/integration/game-screenshots.test.ts tests/integration/game-catalog.test.ts
pnpm test:integration tests/integration/core-schema.test.ts tests/integration/repositories.test.ts
pnpm test:e2e:access tests/access-e2e/game-trailers.spec.ts tests/access-e2e/game-crud.spec.ts
```

Tests cover normalization and hostile references, deferred players, fallback
links, native error handling, database groups, catalog/copy separation,
permissions/revocation, archives, stale/concurrent writes, approval resets and
manual audit. Browser journeys exercise administrator editing, game fallback,
release replacement/removal, stale draft retention, role restrictions, keyboard
use, external-request deferral, and narrow dark/reduced-motion layouts. YouTube
requests are intercepted with a deterministic iframe fixture; live provider
availability, restrictions and consent are not claimed. Direct playback decodes
a short silent WebM generated in Chromium and served by an intercepted external
request, exercising actual browser controls and media loading.

Verified on 2026-10-19: lint, typecheck, formatting, Prisma validation and
production builds pass, along with 818 unit/component cases using two workers,
94 distinct PostgreSQL cases and six trailer plus six game-CRUD desktop/mobile
browser scenarios. The two-worker unit run avoids initial ESLint configuration
startup timeouts under full machine concurrency. Browser verification corrected
an implicit provider label and excluded the framework route announcer from error
selectors; all six trailer cases pass on the final run. Desktop light and 320px
dark/reduced-motion screenshots were reviewed.
