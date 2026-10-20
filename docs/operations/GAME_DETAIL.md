# Game detail page

Task 15.1 assembles the private owned-game page at `/app/games/[id]` using the existing game, release, media and collection services. It follows [DESIGN.md](../../DESIGN.md) and specification §§46–47. Task 15.2 animation/interaction polish remains a separate task.

## Identity and copy context

The hero presents one page title, the selected platform and edition, printing label, publication/identity status, copy reference, publisher, market year, release markets and rating state. The title precedes the cover on narrow screens. Desktop uses a contained cover beside identity and metadata; artwork is never cropped to fill the stage. Existing restrained Blur Fade and Magic Card behavior is retained, including static server HTML and reduced motion.

The authorized detail service selects a release cover before the game default. A failed file displays “Cover image unavailable”; no catalog artwork displays “No catalog cover available.” Personal photographs do not become catalog covers. Source attribution remains inspectable beside the selected artwork. The small client cover component receives only the image URL, alternative text and dimensions.

Release dates retain their recorded precision: `1995`, `1995-08` and `1995-08-22` stay distinct. The hero uses the earliest known market year. Only when market years are missing does it use `firstReleaseYear`, explicitly labeled “market unknown.” It does not invent January 1, attach a broad year to an unknown market or mix copy observations into canonical identity. Publisher credits retain their market scope; distributor credits are not relabeled publishers.

**Rating limitation:** the accepted enrichment architecture still defers typed rating storage and acceptance. The page displays “Not recorded”; it does not synthesize a score, read unaccepted provider evidence or store ratings in generic metadata JSON. A future rating implementation must use the sourced group described in the domain model.

## Sections and navigation

The reading order and primary navigation are:

1. **My copy:** selected edition/markets, serial number, observed markings, location, has-box answer, private notes, defects and personal photos.
2. **About:** release description with whole-value game fallback, game developers, publisher, rating state, partial market dates, catalog product identifiers, release company credits and sourced playtime.
3. **Screenshots:** the existing scoped gallery, private image delivery, source details, pagination and keyboard dialog.
4. **Physical edition:** the shared expected-component selector and lazy packaging/cartridge viewer, with explicit missing/incomplete states. Expected contents do not confirm physical possession or condition.
5. **Edition contents:** the selected release summary and its flat expected-component quantities/descriptions.
6. **Trailer:** the existing structured provider player, opened explicitly before external playback requests.

Metadata sources remain available after these sections. Existing fragment identifiers are retained, including `#game-photos`, `#game-playtime`, `#game-release` and `#game-packaging`. Personal photos and playtime have direct navigation links even though they now sit within My copy and About. Edit/delete dialogs, stale-copy protection and catalog management permissions are unchanged.

Catalog product identifiers are a narrow, deterministic projection of the selected release. The repository retrieves at most 21 records, the service returns 20 and a truthful overflow indicator, and the UI labels issuer/market notes separately from the copy serial/observed markings. Internal normalized values and storage fields are not added to the detail DTO. This is a read-only addition to existing typed catalog data, with no migration or new write path.

## Verification

Verification passes: lint, typecheck, production build, formatting/whitespace, 1,221 unit/component cases, 34 disposable-PostgreSQL game integration cases and 20 distinct desktop/mobile browser cases (four new detail cases and sixteen existing feature regressions). The deferred 3D renderer remains unchanged at 1,011,263 raw / 270,732 gzip bytes, within its existing budget. Light desktop and dark mobile screenshots were visually reviewed. The final task status is recorded in [the development plan](../../DEVELOPMENT_PLAN.md).

The browser fixtures use original synthetic artwork in disposable PostgreSQL/MinIO, not retail covers or a live provider. Coverage includes all six section anchors, single-title semantics, partial dates and catalog/copy separation, cover precedence and source details, failed/absent cover states, long titles, 320px width, light/dark themes, reduced motion, zoom, read-only/revoked/anonymous access and inactive media. Existing copy CRUD, screenshots, trailers, playtime and physical previews are exercised as regressions. Native phone GPU performance is not claimed by viewport emulation.

Implementation: [detail page](../../src/features/games/components/game-detail.tsx), [hero](../../src/features/games/components/game-detail-hero.tsx), [cover fallback](../../src/features/games/components/game-cover.tsx), [presentation helpers](../../src/features/games/detail-presentation.ts), [authorized service](../../src/server/services/collection/game-management.ts), [repository projection](../../src/server/repositories/collection/game-management.ts), [browser coverage](../../tests/access-e2e/game-detail.spec.ts).
