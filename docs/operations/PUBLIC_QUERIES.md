# Public collection query layer

Task 18.2 implements server-only public reads and private administrator publication commands against the [Public Privacy Architecture](../architecture/PUBLIC_PRIVACY_ARCHITECTURE.md). It adds no public page, browser-search endpoint, settings UI or public media handler. The public home and administrator review UI are now documented in [Public home operations](PUBLIC_HOME.md); browse/detail/media entry points follow in Tasks 18.4–18.5. Existing database defaults and the personal collection's publication choices are unchanged.

## Public reads

Services in `src/server/services/public-collection/` expose:

| Method                            | Contract                                                                                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getPublicHome()`                 | A fixed private message when disabled/missing policy; otherwise reviewed site name/description, published-copy counts and eight newest public cards. |
| `getPublicCollection(input = {})` | Bounded published-copy cards, matching totals/category/boxed counts, facets and pagination state. Disabled policy returns generic NOT_FOUND.         |
| `getPublicConsole({ id })`        | Published owned-console identity, canonical platform/model facts and settings-controlled personal details.                                           |
| `getPublicGame({ id })`           | Published owned-game identity, scoped Game/GameRelease facts, credits, expected contents, markets and playtime estimates.                            |
| `getPublicAccessory({ id })`      | Published owned-accessory identity, family/variant facts and explicit variant compatibility.                                                         |

These methods take no session/context/audience argument. Anonymous visitors and authenticated administrators use identical data rules. Strict inputs reject private controls, extra fields, ORM selections and role/publication overrides. Feature entry points in `src/features/public-collection/queries.server.ts` call Next's `connection()` to exclude reads from prerendering without consulting authentication. Future HTTP/page adapters must also set no-store on successful and failed responses; the service does not manufacture HTTP headers.

Each request uses a database-enforced read-only Repeatable Read transaction. Policy is its first data read, so optional selects, root eligibility, matching, counts, facets and related detail reads use one snapshot. No persistent memoization, shared cache or private-data hydration is involved. Unexpected errors become a fixed UNAVAILABLE error; missing/private/wrong-category/invalid detail identities share NOT_FOUND. An enabled collection with no published matches returns real zeros; a database failure does not.

### Collection input and boundaries

`q` is NFC-normalized/whitespace-folded, limited to 160 characters, eight words and sixteen searchable lexemes. Empty terms browse the public collection. Limits are 1–50 (default 20); offsets are 0–5,000. A single extra row is an overflow sentinel, never a private-copy count.

Supported controls are uppercase `type` (CONSOLE/GAME/ACCESSORY), canonical UUID `platform`, `region`, `company`, numeric `year` (1–9999), `hasBox` (true/false/unknown strings), boolean `hasDefects`, assigned-location UUID `location`, and `sort` (relevance/name-asc/name-desc/newest/oldest). Type/category checks use owned-copy identity. All ordering retains a UUID tie-break. Company means a related canonical company credit/manufacturer/effective accessory producer; it does not assert a publisher's region-specific relationship. Dedicated scoped publisher controls remain future browse work.

Location filtering is accepted only with showLocations; unresolved-defect filtering only with showDefects. Unsupported hidden-field controls fail validation rather than influencing result membership. Unresolved means ACTIVE or ACCEPTED. Serial and repair-note matching are always excluded, including when serial detail text is enabled. Notes and defect title/description participate only when their visibility flags permit them.

The public matcher reuses the existing audience-specific full-text/trigram SQL as a database-only matching-ID relation. It never calls private filtered search or private card hydration. Global enablement/PUBLISHED roots precede matching, controls, ordering, counts and facets. Matching counts describe the filtered set, including category zeros for other categories when a type is selected. Box counts include confirmed true only.

Canonical facts are materialized once per SQL statement. This prevents stale publication statistics after a bulk PRIVATE→PUBLISHED transition from repeatedly executing all subtype joins for each match. Search retains its existing transaction-local two-second statement limit and disabled JIT; the new 6,012-copy fixture deliberately leaves publication statistics stale and verifies real page execution plus a once-only facts plan. Exact counts remain database work proportional to eligible rows; no collection-wide count input is loaded into application memory.

Facets contain only platform/region/company/year and, when allowed, directly assigned location values reachable from matching published copies. Counts deduplicate copies within each option. Results cap at 500 options with an explicit `facetsTruncated` flag; this is not an unowned catalog/location directory.

### Detail and media boundary

Personal detail selects include serialNumber, notes and locationId only when their respective settings are true; defects select only public title/description/severity/status when showDefects is true. Hidden keys are absent from DTOs. Account IDs, audit/history, observed markings, repair notes/dates, raw metadata, filenames and storage locators are never selected for public detail. Location breadcrumbs walk only the assigned ancestors, detect incomplete/cyclic paths and stop at 64 nodes with an unavailable result rather than returning a partial path.

Related markets/credits/expected contents/compatibility use 100-row display limits plus sentinels and a truthful `relatedTruncated` flag; defects have their own 100-row limit and `hasMore`. Language lists are bounded too. Canonical source scope is retained, including regional release credits, variant compatibility and whole GameRelease/Game playtime fallback. Zero minutes remains zero; an all-unknown release override never borrows game-level estimates. Expected contents never imply actual owned component presence.

Every card/detail currently has `photo: null`. This intentionally remains a safe placeholder even for an approved use: contextual public delivery is not implemented until 18.5. No private URL, original, thumbnail sibling, template, trailer URL or raw specification JSON is substituted. The richer detail UI may extend these explicit DTOs with validated specifications, reviewed links and eligible media only through the established public contracts. Retained archived canonical identities still describe published owned copies.

## Private administrator commands

`src/server/services/public-collection/publication.ts` provides server capabilities for the later private controls. They require a trusted server-created private context and current ADMIN permissions, including after waiting on locks. No HTTP/action transport is exposed by this task; future transports must retain origin protection and private no-store responses.

| Method                                                                                                                    | Use                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getPublicationSettings(context)`                                                                                         | Current settings and policy revision, requiring settings.manage.                                                                                                                                                 |
| `reviewPublicSettings(context, { expectedRevision, settings })`                                                           | Review site identity, affected published-copy count and a freshness token for the complete proposed seven-boolean settings object.                                                                               |
| `updatePublicSettings(context, { expectedRevision, settings, reviewToken, reviewed: true })`                              | Revalidate the reviewed state, atomically invalidate expanded copy projections and advance policy revision. A normalized no-op retains its revision.                                                             |
| `getItemPublicationReview(context, { id, published = true })`                                                             | A labelled public-projection preview of one copy, even while globally disabled/private; includes copy/settings revisions and a freshness token for the intended publication choice. Requires publication.manage. |
| `setItemPublication(context, { id, published, expectedRevision, expectedSettingsRevision, reviewToken, reviewed: true })` | Recheck review/permissions and atomically set or clear publication metadata and advance the copy revision. Repeating the current state is a no-op.                                                               |

Review tokens are consistency digests, not authorization credentials. The server computes them from the reviewed intent and current item/canonical/site/policy revisions plus location change tokens. Unrelated catalog/copy edits can conservatively stale a review. No full private collection is returned to compute a token: PostgreSQL returns only an aggregate digest. Direct database edits that bypass service revision/invalidation contracts are operator actions outside application approval guarantees.

Widening a personal visibility flag returns affected PUBLISHED copies to PRIVATE exactly once, advances their revisions and clears publication actor/time in the same transaction as the settings update. New exposure is based on nonnull serial/note/location, recorded defects, or approved non-SERIAL personal-media candidates. Media candidates may still fail later byte eligibility; invalidation is deliberately conservative. New flag values never approve an item or asset automatically. Administrators review and republish affected copies under the new policy. Narrowing suppresses the field immediately; a global pause retains prior item/use choices. Indexing settings do not change publication and cannot override the existing noindex baseline before Task 18.6.

## Transaction coordination

The existing `withTransaction` boundary now takes the shared publication-policy advisory guard by default, before its operation can acquire catalog/location/copy/asset locks. This covers existing private read/write transactions as well as all relevant writers through one entry point. Permissions are still enforced by each service. The guard carries no permission or publication cache.

Settings and item approval commands use the exclusive side for a short Read Committed transaction, preventing reviewed content from changing between token verification and commit. Public snapshot reads choose `publicationPolicy: "read"`, which takes no publication guard and issues `SET TRANSACTION READ ONLY`. A caller cannot use that option to perform uncoordinated writes. Timeouts and transaction cleanup remain unchanged; no guard is held while delivering bytes or doing upload/provider processing outside a transaction.

Location renames, type changes and moves additionally invalidate published copies assigned anywhere in the affected subtree when showLocations is true, including while global publication is paused. Existing hierarchy serialization and stale-location tokens remain in force. Reordering or editing a private location description does not invalidate unrelated item approvals. Existing stricter copy/media/defect invalidation is preserved.

The guarantee covers application service transactions, not independent raw database writers. Access grants/sessions remain current server checks. Public reads admitted before a committed change keep a consistent snapshot; later requests re-evaluate current policy. Direct public media revocation/HEAD/range/conditional checks remain mandatory implementation work in 18.5.

## Verification and reproduction

Tests use synthetic copies, metadata-only media graphs and disposable PostgreSQL/MinIO. The public integration suite covers disabled/missing/failed policy, real published-only counts/facets, all categories, wrong identities, conditional detail fields, search noninterference, bounded paging, review/no-op/pause/widening behavior, stale and revoked administrators, concurrent writer/settings coordination, ancestor location edits, snapshot deletion, database read-only enforcement, scoped credits/playtime, media placeholders and 6,012-copy execution plans. Unit selection tests exercise all sixteen combinations of the four personal-field gates to verify that forbidden columns are not fetched, in addition to checking DTOs.

Useful focused commands:

```sh
pnpm test:integration tests/integration/public-collection.test.ts
pnpm exec vitest run src/features/public-collection/validation.test.ts src/server/repositories/public-collection/detail.test.ts
pnpm test:e2e:access dashboard.spec.ts access.spec.ts locations.spec.ts
```

The broader regression run covers existing database workflows because coordination is centralized, the existing asset pipeline, functional search cases, unit/component tests, and desktop/mobile dashboard/access/location journeys. The unrelated existing complete-private-search timing benchmark is outside the functional search run; the new public scale test runs under unchanged production and test timeouts. Final check counts/status are recorded in [the development plan](../../DEVELOPMENT_PLAN.md).
