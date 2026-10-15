# Collection views

Task 7.5 adds the private `/app/collection` browser, linked from the entry page, workspace navigation and command palette. It reuses [collection filters and sorting](FILTERS_AND_SORTING.md) and [private search](SEARCH.md). It opens the complete shared owned collection without requiring a search term. Canonical records without an owned physical copy remain outside this view.

## Layout and cards

**Grid view** is the default. **List view** shows the same copies, identity, copy ID, available metadata and actions in compact rows. Both are responsive and preserve reading order, accessible toggle state and visible keyboard focus. Copies of the same release remain separate. All/console/game/accessory selection uses the existing Item type control; the collection's default is labeled **All items**.

Cards show model/release/variant and market context, known release year, location breadcrumb, available platform/publisher or accessory producer, box status and unresolved-defect count. Missing observations remain explicit: unknown year or box status is not a zero/false observation, and “No unresolved defects recorded” does not claim that the item is fault-free. Incomplete canonical identities retain their label. The release-year, regional publisher, manufacturer and producer rules are unchanged from Task 7.4.

**Photos** and **Defects** open the existing manager for that exact physical copy. Cards do not invent detail routes or future catalog-editing actions. Category-specific catalog/owned CRUD, catalog artwork/logo selection and 3D viewers remain in their assigned phases.

A card uses an existing private personal photo where available: an eligible primary photo first, otherwise stored photo order with a UUID tie. Custom logo/model and serial-label classifications are excluded from automatic previews. Only ready IMAGE assets with DISPLAY delivery are eligible. A ready thumbnail from the display image's original RESIZE lineage is preferred; otherwise the ready display image is used. Original uploads are never embedded. Each page hydrates these summaries in one bounded batch on the existing authorized database snapshot, rather than loading each copy's gallery separately.

Photos use lazy, contained static images with meaningful alternative text and stable media stages. Their authenticated `/api/media/private/<asset-id>` URLs bypass Next.js's shared image optimizer; delivery independently checks current access and remains private/no-store. Object keys, bucket names, raw provenance/manifests, original filenames, notes and serial values are not returned in card summaries. A missing photo has a neutral fallback labeled **No photo yet**; compact rows retain that label for assistive technology. A failed image read displays **Photo unavailable**, preserving the copy's identity and actions. No borrowed artwork or fabricated image is used.

The owned Magic Card adaptation adds a neutral 5% pointer spotlight only to grid cards with a mouse/fine pointer and no reduced-motion preference. It uses the existing Motion dependency and semantic palette, with no continuous animation, travel, hidden content or effects required for navigation. List, touch, server-rendered and reduced-motion presentation stay static. The source follows the [Magic UI card pattern](https://magicui.design/docs/components/magic-card) with the project's restrained design rules.

## Local preference

The browser stores only `grid` or `list` under `gemukore.collection-view.v1`. No item IDs, user identity, filters or private search text enter that preference. It is a device/browser preference, independent of the authenticated account and URL. The setting survives reload and navigation, and storage events synchronize other tabs. Unsupported values fall back to grid without being overwritten on mount.

The hook uses React's [external-store subscription](https://react.dev/reference/react/useSyncExternalStore) with a stable server snapshot, keeping server rendering and hydration consistent. Only an explicit user selection writes storage. If reading/writing storage is blocked, switching remains usable in the current page session, including pagination; persistence is unavailable until browser storage works again.

## Pagination

Collection and full-page search both have Previous, Next and (after page one) First page controls. Page size is fixed at 20. `page` is a validated URL parameter alongside filters and sorting; page one is omitted from generated URLs. Reload, bookmarks and Back/Forward restore the page and controls. Layout changes do not request data, reorder copies or change the page.

```text
/app/collection?type=game&platform=snes&sort=name-asc&page=2
```

The client maps page two to offset 20 in the private POST body. Page numbers are canonical positive integers from 1–251, matching the existing offset ceiling of 5,000. Zero, negative/fractional/leading-zero values, duplicate parameters, unsupported fields and combined URLs over 2,048 encoded characters are rejected. An invalid URL does not silently broaden into an unfiltered collection request.

Filtering, complete text matching, physical-copy deduplication and deterministic ordering happen before the page limit. The service fetches one extra row to determine whether another page exists. The interface shows only known facts: page number, returned count and the copy range for that response. It does not invent a total count or number of pages. The final page disables Next; the offset ceiling disables further navigation and asks for narrower filters/search when more matches exist.

Changing a filter or sort resets to page one. Changing private search text also resets to page one, replacing the current URL entry once instead of creating history for keystrokes. Text remains only in memory and POST bodies. A reload therefore restores filters/page but clears text; a bookmarked collection page describes structured controls, not a saved private query. The `/app/search` route retains its idle behavior without terms/active filters.

Explicit page navigation focuses the results heading after loading, so keyboard users reach the newly loaded copies. Loading clears previous results and uses static layout-appropriate skeletons. Errors retain input and allow retry; stale responses are cancelled/ignored. A valid page with no remaining rows explains that the collection may have changed and offers first/previous-page recovery. Empty unfiltered collections remain distinct from filtered misses. Concurrent committed edits may move copies between pages; navigation does not hold a database snapshot across requests.

## Service boundaries

`POST /api/collection/private` is read-only and accepts the strict existing `{ q, controls, limit?, offset? }` search contract. It permits empty text to browse, while the original filtered/private search endpoints retain their prior idle semantics. One-character terms stay idle and nonempty punctuation-only input cannot broaden into browsing. A view name or URL page number is not a server query field: the client validates them and sends only a bounded offset.

The transport reuses session identity, same-origin enforcement, private/no-store response headers, body/input limits, deadlines and redacted errors. Current `private.read` is checked before validation and again inside the repeatable-read transaction for ADMIN, EDITOR and VIEWER. Matching and card-summary hydration execute sequentially on that transaction's connection with the existing statement timeout. A changed grant removes obsolete results on the next request; every linked manager and private photo read independently checks access.

Only the new collection use case requests card summaries, after final paging. Existing unfiltered/filtered search and palette results do not acquire additional copy/media fields. Reserved public SQL is unchanged; there is no public collection browsing service or endpoint in this task. No dependency, migration, external search service, background process or personal development fixture is added.

## Verification

Run the normal lint, type, unit/component, PostgreSQL and desktop/mobile production browser checks documented in [TESTING.md](TESTING.md). Focused browser verification uses:

```sh
pnpm test:e2e:access tests/access-e2e/collection.spec.ts
```

Unit/component cases cover page validation, strict private transport, copies/actions in both layouts, missing observations and image failure, preference restoration/synchronization/blocked storage, empty-state distinctions and page resets. PostgreSQL cases cover live owned graphs, 45 same-release copies over three pages, page boundaries, narrow metadata and photo lineage, photo selection/fallback, role checks, strict body/origin validation and revoked access. The existing 3,004-copy plan fixture also executes collection searches with card hydration.

A diagnostic complete plan exposed 891 JIT functions taking 2,142 ms to compile within a 2,145 ms browse read. Search configuration now disables JIT only transaction-locally while retaining the two-second deadline. A regression forces a low JIT cost threshold, verifies no compilation in the actual filtered query plan and checks that pooled settings are restored. This follows PostgreSQL’s guidance that [JIT overhead can outweigh the benefit for short queries](https://www.postgresql.org/docs/16/jit-decision.html). No global database setting is changed.

Production browser journeys cover both layouts and saved preferences, pagination/bookmarks/Back, query/filter/sort resets, invalid URLs, empty pages, access changes, an actual upload and private thumbnail read, serial-preview exclusion, blocked storage, full-page search paging and a 320px dark/reduced-motion layout with long names. All fixtures remain in disposable PostgreSQL/MinIO, never personal development data.

Verified on 2026-10-15: **583 unit/component, 400 PostgreSQL integration and 188 desktop/mobile browser cases pass (1,171 checks)**, plus lint, types, formatting, production browser builds, internal documentation links and whitespace checks. Local Docker liveness is healthy on port 3002, and anonymous collection POST requests receive private no-store 401 responses. Next: Task 8.1 — Console Catalog.
