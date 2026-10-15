# Collection filters and sorting

Task 7.4 adds URL-based controls to the existing private `/app/search` workspace. They combine with [collection search](SEARCH.md), retain one result per physical copy and use live catalog relationships. No dependency, schema change, migration or personal collection fixture is required. Category pages such as `/app/games` remain in their assigned phases; the shared control contract can support them later.

## Using the controls

Choose a filter to browse without entering search text, or combine filters with a private search. Primary controls cover item type, platform, commercial region, box status, unresolved defects and sorting. **More filters** contains console manufacturer/model, game publisher/edition, accessory producer, release year and location. Active selections have individual removal buttons; **Clear filters** resets controls while retaining text entered during the current page session. **Browse all copies** resets filters and chooses name order. It retains any current search text, so clearing that field browses the entire collection.

Each change updates the URL immediately. Bookmarks, reload and browser Back/Forward restore those controls. Free text stays in the page's memory and POST bodies: it never enters URLs, local storage or result links, and reload clears it. The implementation uses Next.js's supported [native History API integration](https://nextjs.org/docs/app/getting-started/linking-and-navigating#native-history-api), which updates `useSearchParams` without replacing the page or losing entered text and focus.

For example, where these canonical slugs exist:

```text
/app/search?type=game&platform=snes&region=us&hasBox=true&sort=year-desc
```

Slugs are stored canonical identities, not hardcoded region codes: a collection using `north-america` must use that slug instead of `us`. Location values use UUIDs because locations do not have canonical slugs. Combinations use AND. Incompatible type-specific selections return no matching copies rather than silently discarding a filter.

Select options come only from canonical records referenced by owned copies and from those copies' location ancestry. Existing owned references to archived catalog identities remain usable. Options do not expose descriptions, provenance, notes, serials, defects or unowned catalog records. Options are loaded on page navigation/reload; a valid selection whose record is no longer available remains selected as **Selected value unavailable** until removed. An unavailable selection does not broaden results to “Any.”

## Filter contract

| Parameter      | Meaning                                                                                                                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`         | `console`, `game` or `accessory`, matching the owned root type.                                                                                                                                                             |
| `platform`     | Console model's platform, game release's platform, or an accessory variant's explicit compatible platform.                                                                                                                  |
| `manufacturer` | The actual console model's manufacturer; a platform brand is not a substitute.                                                                                                                                              |
| `publisher`    | A `PUBLISHER` credit on the game release. When a region is selected, the credit must be unscoped or scoped to that same linked release market. Game developers, distributors and unrelated regional credits do not qualify. |
| `producer`     | Either explicit accessory-family or variant producer. This does not rewrite or infer either relationship.                                                                                                                   |
| `model`        | Console model slug, independently of the platform slug.                                                                                                                                                                     |
| `region`       | A linked commercial market on the console model, game release or accessory variant. It does not infer hardware compatibility or expand geographic hierarchies.                                                              |
| `year`         | A positive year from 1–9999, or `unknown`, using the release-year rules below.                                                                                                                                              |
| `location`     | A private location UUID, including its descendants, or `unassigned`.                                                                                                                                                        |
| `hasBox`       | `true`, `false` or `unknown`. A missing observation is never treated as “without box.”                                                                                                                                      |
| `hasDefects`   | `true` for an ACTIVE or ACCEPTED defect, `false` for no such record. Repaired history remains searchable but does not count as unresolved. “No unresolved defects recorded” is not a claim that an item is fault-free.      |
| `edition`      | An existing `GameEditionType` enum value, such as `STANDARD` or `COLLECTORS`.                                                                                                                                               |
| `sort`         | A supported fixed order from the table below; defaults to `relevance`.                                                                                                                                                      |

Console years belong to the actual model, and accessory years to the actual variant; missing years do not inherit a platform/family year. Without a region filter, a game's year is its earliest known market release year, falling back to `firstReleaseYear` only when no market year is known. With a region filter, only that market's year applies. An unknown selected-market year stays unknown even if another market or the generic fallback has a known year. Partial dates are not converted to invented timestamps. Year options include every known linked market year, including years later than the aggregate earliest year.

Location labels show the full private breadcrumb. Selecting a parent includes directly assigned copies and copies assigned below it. Unassigned copies remain distinct. These values and labels are intentionally confined to authenticated collection controls.

## Ordering

| URL value               | Order                                                                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `relevance`             | Existing whole identity/identifier, match quality, source priority, strength and normalized title order. Browsing without terms falls back to title order. |
| `name-asc`, `name-desc` | Case-folded NFC identity title, ascending or descending.                                                                                                   |
| `newest`, `oldest`      | Collection item's added/created timestamp, descending or ascending.                                                                                        |
| `year-asc`, `year-desc` | Effective release year, with unknown years last in both directions, then title.                                                                            |
| `location`              | Full location breadcrumb, unknown/unassigned last, then title.                                                                                             |
| `platform`              | Platform label, then title. Multi-platform accessories use the complete alphabetically sorted compatible-platform label.                                   |
| `publisher`             | Complete alphabetically sorted, deduplicated publisher label, scoped to the selected region when present; missing publishers last, then title.             |

Every order ends in the physical copy UUID to keep ties deterministic. String ordering uses PostgreSQL's configured collation after case folding and NFC normalization. These are not locale-specific natural-language or numeric-title sorts. Concurrent committed edits can change pages between requests; there is no long-lived snapshot across navigation.

The approved current schema has no rating field, and the domain model assigns ratings to Phase 11. Rating filtering/sorting mentioned in the product specification is explicitly deferred until those fields and rating semantics exist. Unsupported `rating` parameters are rejected. Grid/list switching, pagination controls and saved view preferences remain Task 7.5. The first 20 results and existing `hasMore` guidance remain available; services retain bounded offset/limit support for the next task.

## Transport, queries and privacy

The page uses `POST /api/search/filtered` when nondefault controls are active:

```json
{
  "q": "chrono",
  "controls": {
    "type": "game",
    "platform": "snes",
    "hasBox": "true",
    "sort": "year-desc"
  }
}
```

An empty `q` with active controls browses matching copies. An empty query without controls stays idle; a one-character query also stays idle. Nonempty punctuation-only queries do not turn into an unfiltered browse. Without active controls the full page uses the existing private search endpoint. The command palette retains its independent lookup behavior and is not affected by page filters.

Both browser and server validate the strict control schema. Duplicate or unknown URL parameters, malformed slugs/UUIDs/years, empty values and unsupported enums produce a visible invalid-controls state and no broadened request. Encoded URL controls are limited to 2,048 characters. Default relevance is omitted from generated URLs. Body validation, private no-store headers, origin checks, authentication, body deadlines and 4 KiB bounds reuse the existing search transport. Free-text and paging limits remain those documented in [SEARCH.md](SEARCH.md). There is no GET handler or public filtering endpoint, and callers cannot select a privileged audience or bypass permissions.

Current `private.read` permission is checked before input handling and again inside the repeatable-read transaction for every search and option read. Filtering, matching, ordering and projection share that snapshot and the existing two-second statement timeout. Permission changes clear obsolete displayed results on the next request. The client cancels previous requests, rejects late responses and clears results immediately when text or controls change, including Back/Forward navigation.

The repository builds parameterized SQL with fixed allowlisted predicates/order expressions. Request-local materialized CTEs derive owned facts, apply all controls before complete term matching, deduplication and final ordering/paging, and retain a single row per physical copy. No candidate limit can hide a valid later match. This reuses the existing full-text/trigram indexes and normalized relationships without a persisted search document, external search service or synchronization job.

Only the final bounded page receives a narrow optional `details` projection: effective release year, location breadcrumb, platform and publisher labels. Private notes, serials, repair notes and defect prose can still match through the private search graph but are not returned as excerpts. Existing unfiltered and reserved public SQL projections remain separate; public SQL cannot receive these controls or private location details. Database failures remain redacted errors rather than empty successful results.

## Verification

Verified on 2026-10-15: **558 unit/component, 393 PostgreSQL integration and 168 desktop/mobile browser cases pass (1,119 checks)**, plus lint, TypeScript, formatting, production browser builds, internal documentation links and whitespace checks. See [TESTING.md](TESTING.md) for run details and isolation.

New coverage includes strict URL round trips, duplicate/unknown parameters, transport bodies, cancellation and late responses; actual PostgreSQL filter combinations, multiple copies, regional credit/year correlation, unknowns, repaired defects, manufacturer/producer boundaries, nested locations, option reachability, stable orders, filters before bounded paging, role checks and revocation. The 3,004-copy plan fixture runs the filtered service and complete SQL plans for selective terms, typos, cross-source matching, common terms and short prefixes within the configured timeout. This measures an isolated hobby-scale dataset, not a production concurrency guarantee.

Production browser journeys exercise bookmarks/reload, Back/Forward, filter removal/reset, category-specific filters, all supported primary sort interactions, private POST text retention, invalid URLs, revoked access, keyboard focus and the command palette alongside the controls. Desktop/mobile screenshots and a 320px dark/reduced-motion layout are checked. These journeys use disposable databases/storage and actual signed test sessions, never personal collection data or production authentication bypasses.
