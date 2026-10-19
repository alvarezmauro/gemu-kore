# Game playtime

Task 11.6 adds canonical playtime estimate sets to private game details. Each set
contains main story, main + extras, and completionist minutes with one shared
source and recorded timestamp. These are estimates for the game, rather than a
log of the collector's personal time played.

## Scope and unknown values

A Game can have one default set. A GameRelease can have one override that
replaces the **whole set**, including its source. Unknown release durations never
borrow individual values from the game or another release. A release set with
three unknown durations still overrides the default. Remove that release set to
return to the game default. The private detail labels the selected scope.

Durations are nullable nonnegative integer minutes, bounded by PostgreSQL's
integer range. A blank entry means unknown; zero displays as **0 min**. The detail
formats other values in hours and minutes without rounding away minutes. No
ordering between the three estimates is inferred or imposed.

## Administration and review

Administrators use **Manage playtime** on a saved game/release catalog record, or
**Manage release playtime** on an owned game detail. The editor is
`/app/catalog/games/playtime?kind=game|release&id=<catalog UUID>`.

1. Enter whole minutes or leave durations blank.
2. Choose **Manual estimate** or **External source**, name the source, optionally
   add a source URL, and enter the recorded date.
3. Choose **Review estimates** to compare the current and proposed sets, then
   **Confirm and save**. **Keep editing** preserves the form draft.

Manual estimates are always explicitly labeled manual. External source values
are entered by an administrator in this task; they are labeled external rather
than presented as measured facts. Source URLs accept HTTP/HTTPS without
credentials, up to 2,048 characters after normalization; source names are required
and limited to 200 characters. The source link opens with no referrer.

Every write requires explicit reviewed acceptance, including external-source
replacement, clearing all durations, and removal. **Remove estimate set** opens
the same review before deletion; clearing durations alone retains a sourced set
of unknowns. There is no automatic import or external fetch. Provider adapters
and enrichment review arrive in their assigned Phase 12/13 tasks and must use
these revision/source boundaries before replacing manual values.

EDITOR and VIEWER can read private copy estimates but cannot access the catalog
editor or mutate its service. Mutations strictly validate input, check current
permissions before and after the shared catalog write lock, reject archived or
stale roots, and atomically advance the catalog revision and record manual
metadata history. The action accepts no actor, child-row ID or unchecked target
foreign keys. Review captures the displayed revision; a conflicting save retains
the proposed set and form draft. **Reload saved estimates** refreshes the saved
comparison and revision while keeping form entries for a new explicit review.
Controls stay disabled through mutation and
revision refresh. Target navigation resets the editor to avoid carrying a draft
into another catalog record.

## Persistence and timestamps

`GamePlaytime` has real, nullable unique Game/GameRelease foreign keys with an
exactly-one-target database check. Nonnegative duration and source constraints
also apply in PostgreSQL. There is one current set per scope; replacements update
that row and preserve its ID/creation timestamp. Prior source/value snapshots
remain in the root's `MetadataChange` history with the administrator identity.
No-op saves preserve revisions and update timestamps.

The row records `observedAt`, `createdAt` and `updatedAt`. New calendar-date entries
are stored at midnight UTC; editing an existing set preserves its full observed
timestamp when the displayed date is unchanged. The UI shows recorded and
updated dates, with full ISO timestamps in semantic time attributes. Unknown
durations do not imply unknown source/date metadata.

Deleting a legitimately deletable catalog target cascades its playtime row.
Existing restrictions on catalog records with copies, expected contents,
references or history are preserved. Removing a playtime set through the service
retains its manual history. Catalog edits do not change owned-copy observations,
publication, personal notes, location or media. No public query is added.

## Migration and checks

Apply `20261019140000_game_playtime` using the normal deployment workflow before
running the updated application:

```sh
pnpm db:deploy
pnpm db:generate
```

Verification uses disposable databases and never migrates personal development
data. No dependency or environment variable is added.

```sh
pnpm lint
pnpm typecheck
pnpm db:validate
pnpm test --maxWorkers=2
pnpm test:integration tests/integration/game-playtime.test.ts tests/integration/game-trailers.test.ts tests/integration/game-crud.test.ts tests/integration/game-catalog.test.ts tests/integration/core-schema.test.ts tests/integration/repositories.test.ts
pnpm test:e2e:access tests/access-e2e/game-playtime.spec.ts tests/access-e2e/game-crud.spec.ts
```

Unit/component cases check strict input, zero/unknown handling, formatting,
source safety, dates, timestamp precision and explicit review. PostgreSQL cases
check whole-set fallback, distinct release scope, source replacement, no-op
timestamps, root audit, permissions/revocation, archives, stale/concurrent writes,
rollback, target uniqueness/foreign keys and cascade on deletable roots. Browser
journeys check the actual catalog links, comparison and cancellation, saved
detail data, all-unknown overrides, confirmed removal/fallback, unsafe inputs,
stale draft/focus retention, role restrictions and narrow dark/reduced-motion
layouts. Existing game CRUD and schema/repository checks provide regressions.

Verified on 2026-10-19: lint, typecheck, formatting, Prisma validation and
production builds pass, along with 841 unit/component cases using two workers,
98 distinct targeted PostgreSQL cases, and six playtime plus six game-CRUD
browser scenarios across desktop/mobile Chromium. All nine playtime integration
cases pass after correcting the deletion fixture to remove existing expected
contents before deleting a catalog release. The final recovery/layout journey
also passes on both browser projects, with the review heading clear of its close
button at 320px. Desktop light and narrow dark/reduced-motion detail and review
screenshots were inspected. Personal development data was unchanged.
