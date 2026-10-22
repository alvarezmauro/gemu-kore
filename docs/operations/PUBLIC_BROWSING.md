# Public collection browsing

Task 18.4 adds `/collection/consoles`, `/collection/games`, `/collection/accessories` and `/collection/search`. The last route explores all published owned copies, with optional category selection. Home-page category links and **Explore all objects** open these pages. Each entry represents one physical copy; duplicate catalog identities remain separate entries and counts.

Pages are Server Components using the dedicated public query service directly. Native GET search/filter forms and real pagination links work without JavaScript. The pages never load a session, private palette, private inventory DTO or private filter-options directory. All visitors receive the same public contract, including administrators.

## URLs and controls

The public URL adapter accepts only these keys:

| Parameter                       | Values                                                                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `q`                             | Normalized search text, at most 160 characters and eight words.                                                                          |
| `type`                          | `console`, `game`, `accessory`; only on `/collection/search` or the public API. Category routes fix their own type and reject overrides. |
| `platform`, `region`, `company` | Canonical UUIDs represented by matching published copies. Company includes the public query layer's canonical company relationships.     |
| `year`                          | Integer from 1 to 9999.                                                                                                                  |
| `hasBox`                        | `true`, `false`, `unknown`; box presence does not imply completeness.                                                                    |
| `location`                      | Location UUID, only when current public location visibility permits it.                                                                  |
| `hasDefects`                    | `true` or `false`, only when current public defect visibility permits it; filters active/accepted defects.                               |
| `sort`                          | `name-asc` (default), `name-desc`, `relevance`, `newest`, `oldest`.                                                                      |
| `page`                          | 1–251, default 1. Twenty copies per page maps to the service's existing maximum offset of 5,000.                                         |

Empty optional form controls mean no filter. Repeated keys, unknown keys, category overrides, malformed values and encoded query strings longer than 4,096 characters are rejected. Public URLs do not accept arbitrary service `limit`/`offset`, private controls, an audience or a role. The internal service retains its existing typed contract; lowercase URL types are translated by the adapter.

Applying or removing a filter resets to the first page. Native form controls reset to the new URL state on navigation, including when a visitor has typed text without submitting it. Pagination preserves search, filters and sort, with a stable owned-UUID tie-break supplied by the repository. Bookmarks, reloads and browser history retain the URL state. The bounded last page offers a narrowing hint instead of an invalid next-page link when more matches exist. Deletion can leave a formerly valid page empty; the page reports that condition and offers the first page with its search intact.

## Counts, options and privacy

Filtering, matching, ranking, counts and facets use published roots before pagination, in the existing read-only Repeatable Read transaction. The response adds a narrow `filters` object containing only currently permitted personal filter keys (`location: true`, `hasDefects: true`). Disabled keys are omitted. This is not a settings DTO and contains no policy revision, account data or other visibility flags.

Options and their counts describe the intersection of the current search and all selected filters, including the current category. They are not global catalog choices or self-excluding facets. The existing five-hundred-option cap and `facetsTruncated` indicator remain explicit. A selected option absent from the current results retains a generic **Selected option** label; it is never resolved through a private lookup. Clear an active filter to widen those options again.

Location choices are drawn only from matching published copies when allowed. Defect and note matching follow their current settings. Copy serials and defect repair notes never participate in public matching, even when serial detail text is enabled. Private copies and unowned catalog entries cannot contribute options, counts or matches. Results show safe canonical identity, box state and identification caveats, with neutral photo placeholders. Task 18.5 adds detail links and contextual media; see [public detail operations](PUBLIC_DETAILS.md).

## Public JSON endpoint and errors

`GET /api/search/public` uses the same URL controls and public collection service, returning its public DTO. Automatic HEAD handling repeats those gates without a response body. It does not accept or derive a private identity; Cookie, Origin and forged role headers do not widen the response. Pages do not call their own HTTP API.

Every response uses `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` and a same-origin referrer policy. The existing request proxy also covers the endpoint, including unsupported methods and generic framework responses. Public pages remain dynamic and default to noindex/nofollow; Task 18.6 now supplies current-policy SEO controls.

Disabled/missing public policy returns generic 404 for pages and JSON, including malformed queries. Policy is checked before invalid controls can produce a different response. Enabled invalid API requests return 400; invalid page controls show a generic recovery state. Database/service failure returns generic JSON 503 or unavailable page text with the current valid search preserved in its retry link. The page transport retains Next's normal status behavior for these rendered recovery states. Empty published results remain successful and differ from unavailable/disabled states. Errors do not reveal database diagnostics or privately resolved identities.

## Verification

URL and component tests cover strict parsing, normalization, duplicate/prototype-looking keys, category confinement, fixed bounds, safe selected-option fallback, optional filter gates, static GET forms, duplicate copies, honest empty/deleted-page states and the pagination ceiling. HTTP unit tests cover public-only service calls, policy-first denial and sanitized no-store errors. PostgreSQL integration tests cover current filter capabilities and the actual URL-to-service boundary in addition to the existing publication/query suite.

Production browser tests in `tests/access-e2e/public-browse.spec.ts` use synthetic published/private records, forty-five game copies sharing one release, public/private locations and canonical options. They exercise native search/filter combinations, fuzzy matching, three pages without duplicate IDs, refresh/history/deletion, current policy changes, anonymous/admin/editor/viewer HTML/Flight/JSON, rejected controls, HEAD/conditional/method responses, disabled 404s, JavaScript-free forms/paging, long titles, themes, enlarged text and 320px layouts. Run through `pnpm test:e2e:access public-browse.spec.ts` for disposable PostgreSQL/MinIO and test-only TLS. Foundation browser tests verify unavailable pages and JSON without a reachable database.

Verified on 2026-10-21: lint, typecheck, production builds, formatting, documentation links/fences and whitespace; 1,360 unit/component cases; twenty-two publication/query integration cases; fifty distinct desktop/mobile browser checks (twelve public browse, ten public home/review, twenty private collection, eight foundation/recovery), with focused reruns of corrected navigation and native-control checks. Light/dark browse screenshots were inspected. The native-control regression now verifies that cleared URL filters reset the form even after unsaved text edits. An older private-collection browser locator now selects its main-content link; pagination checks wait for the requested range and URL before reading results. Existing assertions and timeout limits were retained. No personal database migration or publication change was performed.

See [public home operations](PUBLIC_HOME.md), [public query operations](PUBLIC_QUERIES.md) and the [public privacy architecture](../architecture/PUBLIC_PRIVACY_ARCHITECTURE.md).

Task 18.5 now links object titles to public owned-copy detail routes. Browse grids keep neutral media stages; the detail pages resolve individually approved media through contextual endpoints. See [public detail and media operations](PUBLIC_DETAILS.md).

Task 18.6 adds [public SEO controls](PUBLIC_SEO.md): base categories may be indexed by explicit permission, while search and parameterized filter pages remain noindex and omit query text from metadata.
