# Collection search

Task 7.2 implements private collection search at `/app/search`, linked from the private entry page and workspace navigation. It follows the [search architecture](../architecture/SEARCH_ARCHITECTURE.md) using live PostgreSQL relations, full-text matching and `pg_trgm`. No additional dependency, external search engine or duplicated per-copy search document is introduced.

Task 7.3 reuses this collection query inside the [command palette](COMMAND_PALETTE.md), alongside a separate typed canonical lookup. Its private palette endpoint and canonical preview scope are documented there. Full-page search keeps its existing request/result contract; both interfaces share the cancellable client request hook.

Task 7.4 adds [URL filters and sorting](FILTERS_AND_SORTING.md) on the same page, including browsing without text and a private filtered endpoint. The original unfiltered endpoint, matching semantics and command palette remain available. The sections below describe Task 7.2; the filter guide documents current controls and release-year/location rules.

## Using search

Enter at least two characters. Results represent individual owned consoles, games and accessories: two copies of one release appear separately. Catalog records without an owned copy are excluded. Archived catalog identities remain searchable through their existing owned copies; incomplete identities carry an **Identity incomplete** label.

Names and stored aliases, console models/numbers, accessory variants, manufacturers/producers, game developer/publisher/distributor credits, platforms, editions/printing labels, commercial markets and product identifiers are searchable. Private searches also include observed serial numbers, copy notes, defect titles/descriptions and repair notes, including repaired and accepted defects. Arbitrary technical JSON, provider snapshots, evidence and catalog narrative are excluded.

Words combine across related records using AND. For example, `chrono snes squaresoft` can match a game's name, platform alias and credited company on the same physical copy. `ownersecret cracked` can match that copy's note and defect. Matches on two different copies never combine into one result. Company and market words indicate related facts; they do not assert a publisher's particular regional role.

Canonical names support word prefixes and bounded typo tolerance for alphabetic terms of at least four characters. Serial numbers and commercial identifiers use literal exact/prefix matching, preserve leading zeros and escape wildcard characters. Private prose uses full-text tokens without fuzzy matching. Unicode is normalized to NFC; PostgreSQL's `simple` configuration preserves mixed-language tokens without English stemming. This does not provide accent removal, transliteration, translations or linguistic segmentation for languages without spaces.

Results show identity, model/release/variant context, commercial markets, a short copy ID and the matched field categories. Notes, serial values, defect excerpts and repair text are not returned in the search cards. **Photos** and **Defects** open the existing manager for that exact copy. Owned-detail pages remain in their assigned phases.

Search waits briefly after typing, cancels obsolete requests and clears previous results when input changes. Idle, loading, empty, validation, unavailable and changed-access states are accessible; errors retain input and allow an explicit retry when input is valid. The page supports keyboard use, mobile layouts, dark mode and reduced motion. The first 20 matches are shown; when more exist, the page asks for another word. The command palette and URL filtering/sorting are now implemented by Tasks 7.3–7.4; collection-view pagination controls remain Task 7.5.

## Transport, authorization and limits

`POST /api/search/private` is read-only and accepts a strict JSON object:

```json
{ "q": "chrono snes", "limit": 20, "offset": 0 }
```

The page sends free text in the body, not the URL, and does not save it in browser storage. Reloading starts idle. Responses use `Cache-Control: private, no-store`, `Vary: Cookie` and a same-origin referrer policy. The configured same origin is required; cross-site requests are refused. There is no GET search handler, caller-supplied audience or `includePrivate` switch.

The route establishes a real session before reading the bounded body. Services check current `private.read` permission before validation/search and again inside the repeatable-read transaction. ADMIN, EDITOR and VIEWER may search the shared collection. Anonymous, expired and revoked access fail server-side. A request already evaluated before a committed revocation can be in flight; later requests evaluate current policy.

Normalized input is limited to 160 Unicode code points, eight whitespace-delimited terms and sixteen PostgreSQL lexemes. The raw string is capped at 640 UTF-16 units and the HTTP body at 4 KiB, including streamed bytes, with a five-second body deadline. The default page size is 20, maximum 50, with offset 0–5,000. The service fetches one extra row after complete matching, copy deduplication and relevance ordering to determine `hasMore`. Invalid limits are rejected rather than silently reduced. Updating catalog/copy data between requests can change ordering; paging does not hold a long-lived snapshot.

Search applies a two-second statement timeout and a word-similarity threshold of 0.6 transaction-locally. Database errors and timeouts return a redacted unavailable failure rather than an empty success. The browser also bounds waiting and validates the narrow response. Application code does not log request bodies, search text, raw database errors or private excerpts. Deployment tracing and ingress configuration must preserve this policy.

## Query and public boundaries

Fixed, parameterized SQL branches resolve the owned identity graph. Request-local materialized CTEs calculate eligible roots, relationships and canonical matches once; these are temporary query execution results, not persistent materialized views. Each term selects its best permitted source for a copy. Complete matches rank by whole identity/identifier match, lexical versus prefix/typo quality, identity versus contextual source, relevance, normalized title and UUID. Display context is hydrated only after final ranking/paging to avoid repeating market aggregation across broad matches.

Canonical corrections and copy reidentification are visible on the next committed search without synchronization jobs. Defect/copy fields remain scoped to the owning root. All matching and projection use one repeatable-read snapshot.

A separate public SQL constructor is reserved and tested against current publication settings. It starts with published roots while global publication is enabled, permits notes/defects only with their respective flags and always excludes owned serials and repair notes. Hidden data cannot participate in its matching or relevance. Task 7.2 exposes no public service, endpoint or page; a future public entry point must apply its own policy and projection, independently of an administrator's private session.

## Migration and deployment

[20261013120000_collection_search](../../prisma/migrations/20261013120000_collection_search/migration.sql) is additive and transactional. It requires UTF-8, installs `pg_trgm` if absent, defines an immutable text-array alias helper and adds 18 expression indexes: seven canonical FTS/trigram pairs, separate copy-note and defect-prose GIN indexes, and literal serial/product-identifier prefix indexes. Region rows and repair notes use live expressions without extra indexes at this scale. Existing relational constraints, triggers, history and private defaults are preserved.

The migration's explicit expressions and helper are authoritative; Prisma does not represent expression indexes. Keep them in versioned migrations and do not use `db push` or edit an applied migration. The deployment database role must be able to install `pg_trgm`, or the operator must provision it before deploying; failure does not silently disable typo matching.

After starting the configured local database, apply the reviewed migration explicitly:

```sh
pnpm db:deploy
pnpm db:status
pnpm db:check
```

Docker startup does not apply migrations automatically. For a Docker application, the same commands can run inside the existing app service as described in [DOCKER_DEVELOPMENT.md](DOCKER_DEVELOPMENT.md). No catalog or owned-item fixtures are added to development.

## Verification

See [TESTING.md](TESTING.md) for final results. Search integration tests use fresh disposable PostgreSQL with actual migrations, sessions, services and SQL. They verify all owned graphs, multiple copies, aliases/Unicode, literal codes, cross-field AND, ordering, paging, exclusions, canonical freshness, all read roles, revocation, input/transport limits, redaction and the reserved public-query contract. Existing core tests also verify repeated migration deployment, Prisma-visible drift and integrity contracts.

Complete-query `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` cases use 3,004 owned copies, including selective names/typos, a multi-source query, a common word and a short prefix. Selective canonical predicates choose the new GIN indexes without forcing index scans, and all five searches complete under the configured statement timeout. This fixture validates the query shape at a hobby scale; it is not a production latency or concurrency guarantee.

Browser tests exercise the actual private page/API against independent PostgreSQL, real signed sessions and the existing disposable storage runner on desktop/mobile Chromium. They cover usable copy-specific links, live renaming, all categories, POST-only private terms, access changes, retained errors, empty/idle states, keyboard navigation and a 320px dark/reduced-motion layout. No personal data or live provider consent is used.

| Boundary                 | Verification evidence                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| UI → request             | Real typing produces POST bodies on the bare private endpoint; reload clears private input.     |
| Request → access/service | Real cookies/current grants permit all read roles and reject anonymous/revoked requests.        |
| Service → database       | The actual migrated PostgreSQL query matches all three identity graphs and private copy fields. |
| Database → response      | Duplicate relationship hits collapse into individual copy IDs with narrow, validated DTOs.      |
| Response → UI            | Desktop/mobile cards render separate copies and open the existing exact-copy managers.          |

Verified on 2026-10-13: **516 unit/component, 346 PostgreSQL and 134 browser cases pass (996 checks)**, plus lint, types, formatting, production browser builds and whitespace validation. The migration is applied to local development, with healthy connectivity and current migration status. Existing Docker services are restored at port 3002; anonymous access correctly goes to sign-in. Local OAuth providers remain unconfigured; authenticated search is verified through the isolated production browser runner. Next: Task 7.3 — Command Palette.
