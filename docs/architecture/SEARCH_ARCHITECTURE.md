# Search architecture

Task 7.1 · Accepted implementation direction · 2026-10-13

GemuKore will search its existing PostgreSQL relations using full-text search, bounded prefix matching and `pg_trgm`. Results represent physical copies. Catalog identity and related companies/platforms/markets are resolved at query time, so a committed catalog correction becomes searchable immediately. There is no duplicated search document per copy, external engine, materialized search view, synchronization trigger, worker or queue.

This document implements the design scope of [DEVELOPMENT_PLAN.md](../../DEVELOPMENT_PLAN.md), Task 7.1. It follows [PROJECT_SPEC.md](../../PROJECT_SPEC.md) §§5, 69–73 and 84–85, the [domain model](DOMAIN_MODEL.md) and the [repository architecture](REPOSITORY_ARCHITECTURE.md). It defines the Task 7.2 handoff; it does not add application code, database objects, routes or UI. Public execution remains in the public collection phase, while its security boundary is designed now.

## 1. Search units and relationships

The default private search unit is one `CollectionItem.id`. Two copies of one release remain two results. Multiple matching companies, markets, aliases, defects or terms must not multiply a copy's result or count. Catalog records without an owned copy do not become collection results.

| Owned category | Required identity path                                              | Related searchable context                                                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Console        | CollectionItem → OwnedConsole → ConsoleModel → ConsolePlatform      | Model name/number; platform name/aliases; model's actual manufacturer and platform's manufacturer as distinct roles; model markets and product identifiers.                                                        |
| Game           | CollectionItem → OwnedGame → GameRelease → Game and ConsolePlatform | Game name/aliases; edition name/type and printing label; platform; general developer credits and release-specific developer/port developer/publisher/distributor credits; release markets and product identifiers. |
| Accessory      | CollectionItem → OwnedAccessory → AccessoryVariant → Accessory      | Family and variant names; variant model number, color and edition; family and variant producers as distinct roles; explicitly linked compatible platforms; variant markets and product identifiers.                |

A platform's manufacturer is searchable brand context; it does not fill an unknown model manufacturer. Likewise, searching family/variant producers does not rewrite either relationship. Company roles remain explicit. Search only stored commercial market links; do not infer country membership, treat NTSC/PAL as markets or turn region-lock settings into Region rows. Missing relationships mean unknown, not a wildcard market or manufacturer.

For a release with multiple regional publishers, free-text terms identify facts attached to that release. `Sega Japan` does not assert that Sega published its Japanese edition. Later structured publisher-plus-region filters must correlate scoped credits with that same selected release market; unscoped credits may apply across its markets.

Archiving hides canonical records from default creation selectors and future standalone catalog results. It does not remove identities of existing owned copies from collection search. Resolve those retained references using stable IDs, not mutable slugs or names. Preserve incomplete catalog records and expose their identification status where the result needs it; search must not present guessed identity as confirmed.

The command palette's future **Catalog** group has a separate canonical scope and typed target IDs. It must not be simulated by mixing unowned canonical rows into collection results. Task 7.2 delivers collection search; Task 7.3 may extend the explicit private catalog use case without changing copy identity or private/public boundaries.

## 2. Field policy

An indexed field is not automatically a permitted field. The audience-specific query decides which relations may participate in matching and ranking before pagination or projection.

| Source                                                                                                                                              | Private collection search                                                                        | Public collection search                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical names, existing aliases, model numbers, editions/printing labels, company roles, platforms and markets                                    | Included through the owned identity graph.                                                       | Included only through individually published copies while global publication is enabled.                                                                                                                                                          |
| Canonical product identifiers                                                                                                                       | Literal lookup through the appropriate model/release/variant.                                    | Same relationship restriction; identifiers are canonical commercial data, not owned serials.                                                                                                                                                      |
| CollectionItem.serialNumber                                                                                                                         | Literal exact/prefix matching; never fuzzy, numeric conversion or a uniqueness assumption.       | Excluded from search, even when `showSerialNumbers=true`. §69 reserves serial search for authenticated users; the setting may authorize display in another public projection. An administrator visiting public search gets the same public rules. |
| CollectionItem.notes                                                                                                                                | Full-text matching, independently indexed.                                                       | Only when `showNotes=true`, on published copies. Hidden notes cannot influence results or rank.                                                                                                                                                   |
| Defect.title and description                                                                                                                        | Full-text matching for all recorded statuses, including repaired/accepted records.               | Only when `showDefects=true`, on published copies.                                                                                                                                                                                                |
| Defect.repairNote                                                                                                                                   | Private full-text matching.                                                                      | Excluded initially: a public defect description does not implicitly disclose its repair history. No new visibility toggle is added.                                                                                                               |
| Observed markings, location descriptions/breadcrumbs, acquisition/financial data                                                                    | Outside initial free-text scope. Existing markings are not silently treated as serials or notes. | Excluded. Locations remain a separately gated future filter concern.                                                                                                                                                                              |
| Accounts/grants, audit/provenance snapshots, provider/AI suggestions, arbitrary JSON, asset metadata/keys/filenames, image pixels or media captions | Excluded.                                                                                        | Excluded.                                                                                                                                                                                                                                         |

Existing aliases are on Company, ConsolePlatform and Game. Do not invent alias fields on other tables. Canonical descriptions/history/specifications are outside the initial identity search corpus; owned notes and defects supply the explicitly required descriptive search. Years, ratings, box presence, defect presence and location are typed filtering/sorting concerns for Task 7.4, not values flattened into a text document.

Defect title/description and repair notes must have separate vectors. Public notes may reuse an index on the `notes` column, but never a composite vector containing serials, markings or other private fields. The same separation applies to eligibility, match reasons, relevance, counts, suggestions and future facets. Public DTO redaction after a private search is prohibited.

## 3. Query behavior

Start with an ordinary text search, not a query language. Normalize input to Unicode NFC, trim its ends and collapse whitespace. Do not transliterate or strip accents, punctuation or leading zeros from stored identifiers. Apply `normalize(text, NFC)` to the stored-text search expressions as well, before case folding/vectorization, so older decomposed strings match composed input without rewriting stored values. Require a UTF8 database for that function. Use PostgreSQL case folding consistently for comparisons; do not mix a JavaScript-only lowercase convention with a different indexed database expression. [PostgreSQL string normalization and case folding](https://www.postgresql.org/docs/16/functions-string.html).

Initial limits are 160 Unicode code points, eight whitespace-delimited terms and sixteen parsed lexemes across the query. Reject oversized input rather than truncating it. Empty input or one code point produces an explicit idle response with no database search; a consumer can separately offer navigation or recent items. Any supported type filter is a strict enum, not an SQL fragment.

All terms must match the same physical copy, but may match different permitted sources. `chrono snes square` can match the Game name, Platform alias and release publisher. A note on copy A cannot complete a query for copy B. Duplicate input terms are normalized/deduplicated before candidate aggregation. Quotation marks, `OR`, minus signs and `:*` are not user operators; they have no advanced query-language authority. Punctuation is tokenized by PostgreSQL for prose and treated literally for identifier lookup. Punctuation-only input must not become a match-all query.

Use the explicitly qualified `pg_catalog.simple` configuration for every indexed vector and corresponding query. It preserves mixed-language titles, acronyms, Roman numerals and model naming without English stemming or stop-word assumptions. It does not provide accent-insensitive matching, translations, Japanese word segmentation or semantic search. Enter known regional/localized names as aliases; stronger language processing is a future measured requirement.

Matching has three complementary paths:

1. **Literal and full-text:** case-insensitive exact identity/alias/code matches and `plainto_tsquery('pg_catalog.simple', term)` against permitted row-local vectors. Private notes and defects use full words; they are not typo-expanded. Serial and product-identifier lookup are separate literal branches, preserving identifier semantics.
2. **Partial identity:** safe full-text lexeme prefixes of at least two code points on names, aliases, editions and contextual identity text. Model/product/serial codes also support escaped literal prefix lookup. Do not make every long private note an autocomplete dictionary.
3. **Typo tolerance:** alphabetic terms of at least four code points may use word similarity against canonical name/alias text. Begin with the server-controlled `pg_trgm.word_similarity_threshold=0.6`. Exclude identifiers, serials, private prose and numeric/alphanumeric code tokens from fuzzy matching. Run this alongside lexical candidates and rank it below them; do not silently discard fuzzy matches merely because an unrelated exact match exists.

Use the index-supported operator `term <% lower(name_and_alias_text)` for fuzzy candidate filtering, then `word_similarity` to rank those candidates. A bare `similarity(...) > threshold` scan is not the proposed access path. Short queries skip trigram fuzzy search, preventing weak one/two-letter matches and poorly selective trigram patterns. GIN supports the selected operators; GiST nearest-neighbor ranking is unnecessary for this design. [PostgreSQL trigram operators and index support](https://www.postgresql.org/docs/16/pgtrgm.html).

Raw user text must never be cast to `tsquery` or passed directly to `to_tsquery`. Parse it first. A prefix query can be assembled from `tsvector_to_array(to_tsvector('pg_catalog.simple', term))`, formatting each parsed lexeme with `array_to_tsvector(ARRAY[lexeme])::text` before adding a server-owned `:*` and AND separators. PostgreSQL supplies the lexeme quoting; ordinary SQL string quoting is not a substitute for tsquery escaping. Empty parsed terms get no lexical prefix branch. Cap lexemes before construction. [PostgreSQL query parsing and prefixes](https://www.postgresql.org/docs/16/textsearch-controls.html), [text-search functions](https://www.postgresql.org/docs/16/functions-textsearch.html).

Escape `%`, `_` and backslash in literal LIKE patterns before appending the server's prefix wildcard. Bind all values. No user regex, dynamic column/table/operator, user-selected fuzzy threshold or arbitrary order clause is accepted.

## 4. Query structure and ranking

Use three category branches rooted in owned subtypes. Each maps indexed canonical matches back to CollectionItem IDs through existing foreign keys. Add collection-note, literal-serial and defect branches only where the audience's policy permits them. Avoid a wide join that multiplies company, market and defect rows into one Cartesian result.

The logical pipeline is:

```text
current access / public policy + validated input
  → eligible copy IDs and permitted field branches
  → per-term matches through normalized relationships
  → best match per (copy ID, term ordinal)
  → keep copies with every required term
  → deterministic relevance order
  → bounded page of IDs
  → audience-specific narrow projection
```

SQL CTEs, `UNION ALL` and semijoins/EXISTS are implementation tools, not new persisted entities. Preserve one best match per copy/term before calculating relevance. Count distinct term ordinals, not join rows. Do not sum repeated company/market/defect matches as artificial popularity. Do not LIMIT each source's candidate IDs before mapping to owned copies, checking all terms and ranking; that can discard the only relevant owned result. Limit after the complete match set is established.

Sort first by an exact whole-query identity or literal code match, then by the weakest per-term match class: full-token matches before prefixes, and any fuzzy term after wholly lexical matches. Within that class prefer identity over related identity context, then owned notes/defects. `ts_rank_cd` and word similarity may break ties within their own class; do not pretend their numeric scores are directly comparable across unrelated corpora. Finally sort by case-folded display title and full CollectionItem UUID. Two copies may have identical display titles and remain distinct.

Raw scores, vectors and excerpts are internal. Initially return a short match-source label rather than generated HTML snippets. Do not use `ts_headline` output as trusted HTML; future snippets require audience-safe source selection and ordinary escaped text rendering.

A company/market/name change, copy re-identification, defect edit or note edit becomes visible after its transaction commits. The original row remains the source of truth. No search-specific root revision, rebuild job or propagation protocol is needed.

## 5. Index design

Task 7.2 owns the migration enabling `pg_trgm` and creating measured search indexes. The current repository has neither the extension nor text/trigram indexes. Full-text search itself needs no additional extension. Existing FK/reverse indexes already cover model/release/variant, company, market and compatibility traversal; reuse them. Preserve all existing constraints, partial indexes, triggers and migrations.

| Table group                    | Proposed access path                                                                                                                                            | Scope and cautions                                                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Company, ConsolePlatform, Game | Row-local full-text GIN over name plus existing aliases; trigram GIN over lowercased name/alias text.                                                           | Shared identities, not duplicated per owned copy. No description/history/JSON indexing.                                               |
| ConsoleModel                   | Row-local full-text GIN over name and modelNumber; trigram GIN over lower(name).                                                                                | Keep code matching out of the fuzzy text expression. Existing modelNumber B-tree remains useful for exact raw lookup.                 |
| GameRelease                    | Row-local full-text/trigram expressions over editionName and printingLabel.                                                                                     | Resolve game/platform through their indexed rows. Edition-type labels are a fixed enum mapping, not an enum-to-text index expression. |
| Accessory and AccessoryVariant | Local name/edition/color/model-number full-text expressions as applicable; name/edition/color trigram expressions without model numbers.                        | No fictional alias columns. Resolve family, producer and compatibility context through relationships.                                 |
| CollectionItem                 | Separate GIN on notes; nonunique `lower(normalize(serialNumber, NFC))` B-tree with text_pattern_ops, potentially partial for nonnull serials.                   | Public serial search has no branch. Private serial lookup is literal exact/prefix, not trigram.                                       |
| Defect                         | GIN on title plus description; separate private repairNote vector/index only if its measured query warrants it.                                                 | A public vector must never contain repairNote. Existing collectionItemId/status index handles relationship/status traversal.          |
| ProductIdentifier              | Existing `(scheme, normalizedValue)` and target-leading indexes; assess a lower(normalize(value, NFC)) pattern index if global raw-code prefix lookup needs it. | Use normalizedValue only with a verified scheme-specific query normalization; no numeric casting or unique-value assumption.          |
| Region                         | Existing unique code/slug and reverse market joins; small name/code scan initially.                                                                             | Do not add two GIN indexes to a tiny lookup table without evidence.                                                                   |

The schema stores ProductIdentifier.normalizedValue, but a catalog normalization service has not been implemented. Task 7.2 can search its raw `value` with case-insensitive literal exact/prefix matching immediately. Only use normalizedValue when the scheme's normalization is explicitly defined and agrees with the stored data; do not guess an algorithm, strip arbitrary punctuation or rewrite identifiers during search. Later catalog writers own normalization of newly entered identifiers. Raw lookup remains valid for existing records.

This is a query-driven inventory, not an instruction to add every possible index at once. Validate each implemented expression against actual Task 7.2 queries and representative data. Repeatedly scanning a genuinely tiny lookup table is acceptable. Fuzzy matches must remain correct for edition-only releases and variant descriptions even where the initial planner prefers a scan. Do not add global boolean/status, JSON, every-filter combination, duplicated B-tree or simultaneous GIN/GiST indexes without an observed need.

Prefer expression indexes for row-local text initially; they need no Prisma search-vector column. The query expression must match the index expression, including explicit text configuration and NULL coalescing. An index cannot concatenate data from joined catalog tables. GIN is PostgreSQL's preferred full-text index type. [Tables and expression indexes](https://www.postgresql.org/docs/16/textsearch-tables.html), [full-text index types](https://www.postgresql.org/docs/16/textsearch-indexes.html).

### Alias-array helper

PostgreSQL rejects a direct expression index containing polymorphic `array_to_string`, because that function is STABLE rather than IMMUTABLE. Do not bypass this with a generic falsely immutable wrapper accepting arbitrary arrays, or by casting enums, timestamps or JSON into an indexed text expression.

A deliberately restricted helper for already stored **text arrays** is appropriate: their text elements require no timezone-sensitive output conversion. It reads no tables or configuration and has no privileged execution. The following is a tested blueprint, **not an applied migration**:

```sql
CREATE FUNCTION search_alias_text(input text[])
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT pg_catalog.array_to_string(
    COALESCE(input, ARRAY[]::text[]), ' '
  )
$$;

CREATE INDEX game_identity_fts_idx ON game USING gin (
  to_tsvector('pg_catalog.simple'::regconfig,
    normalize(COALESCE(name, '') || ' ' || search_alias_text(aliases), NFC))
);

CREATE INDEX game_identity_trgm_idx ON game USING gin (
  lower(normalize(COALESCE(name, '') || ' ' || search_alias_text(aliases), NFC))
  gin_trgm_ops
);
```

Task 7.2 must retain the text[] restriction, function definition and exact indexed expressions in the migration and repository tests. A later semantic change to this helper, its collation assumptions or text-search dictionaries requires deliberately rebuilding affected indexes. Nulls cannot erase the rest of a document. Avoid generated per-copy vectors, an alias child table solely for indexing, or a separate vocabulary/suggestion table at this scale. [PostgreSQL function volatility contract](https://www.postgresql.org/docs/16/sql-createfunction.html).

## 6. Application boundaries and transport

Use the existing modular monolith and permission context:

| Layer                                         | Responsibility                                                                                                                                                                      |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `features/search/contracts.ts` and validation | Separate private/public inputs and DTOs, with dependency-free result contracts and strict input schemas. No permission fields accepted from clients.                                |
| Feature server entry points / HTTP handlers   | Establish real auth context, translate redacted failures and enforce transport limits/cache policy.                                                                                 |
| `server/services/search/`                     | Require current private.read or load current public policy; select the permitted use case, validate and own the read transaction.                                                   |
| `server/repositories/search/`                 | Server-only, parameterized Prisma.sql/queryRaw for fixed query branches and explicit selected columns; receive transaction handles. No auth, external I/O or transaction ownership. |
| Server Components / small client controls     | Render narrow results; debounce input, cancel obsolete requests and ignore stale responses. No database calls or browser-side publication decisions.                                |

Private search accepts verified VIEWER, EDITOR and ADMIN access. It does not require catalog.manage to read owned identity. Authentication and current-grant checks apply on each request, including pagination and palette suggestions. Authorize before attempting expensive search. There is one shared collection; uploader/creator ID is not an ownership filter.

Use **POST `/api/search/private` as a read-only search**, with a bounded JSON body. Serial/note searches should not enter the URL, browser history or URL access logs by default. Do not serialize the private term into server-rendered links. Require the configured same-origin request, use normal session cookies and do not enable cross-origin credentialed search. The service can also be called directly from a server entry point. POST here performs no mutation and does not need a Server Action merely because its input is in the body.

Reserve **GET `/api/search/public`** for the later public collection implementation, with its own strict query parameters and service. Public queries never upgrade based on a signed-in administrator's session. URL-based type/platform/region/etc. filters remain the Task 7.4 design; using a body for potentially sensitive private free text does not prevent bookmarkable filter IDs. Do not introduce a generic `includePrivate` or caller-supplied audience flag.

Private responses use `Cache-Control: private, no-store` and `Vary: Cookie`; policy-dependent public responses use `Cache-Control: no-store`. Do not use ISR, persistent result caches, signed search tokens or private-query telemetry. Request-local deduplication after access is established is sufficient. Do not log raw search text, serials, notes, snippets or request bodies; redacted duration/status/row-count diagnostics are enough. Query privacy also applies to tracing and error reports.

Read current PublicSettings, eligibility, matching and projection in one consistent snapshot (one query or short RepeatableRead transaction). Never calculate candidates under yesterday's settings and later hydrate them under today's settings. A request admitted before a policy change may be in flight; newly evaluated requests after the committed change must enforce it. `allowSearchEngineIndexing` is a robots preference, not an access gate.

Set the server's word-similarity threshold and a starting two-second statement timeout transaction-locally, using the existing transaction owner. Do not leave altered settings on pooled connections. Use fixed templates and bound parameters, including paging values. The timeout is a resource bound to validate in Task 7.2, not a measured latency promise. Return a generic unavailable response on database/timeout failure, not a successful empty result.

## 7. Result and paging contract

The private result carries CollectionItem ID/type, its resolved identity label, narrowly selected platform/model/release/variant/edition/market context, copy identifier, identification status and permitted match-source labels. Avoid copying all private notes or serials into cards simply because they were searched. A public result has its own projection and only permitted source labels; it cannot be produced by deleting fields from a private result object.

Return `items`, `hasMore` and normalized request/paging metadata needed by the consumer. Raw vectors, ranks and database metadata are not exposed. Initially use limit 20, maximum 50 and bounded offset up to 5,000, fetching limit+1 after final deduplication/ranking. Do not silently truncate a larger requested offset. Bounded offsets are a deliberate hobby-scale tradeoff: relevance is calculated across current relations and there is no stable indexed relevance cursor. If measured deep paging requires keyset pagination, introduce a defined cursor bound to query/sort/audience with complete tie-breakers; a cursor is never authorization. Updates between pages may move results, and no long-lived search snapshot is promised.

Exact totals are optional. If a consumer needs them, count the same complete eligible match set before paging; do not infer the total from a limited source branch or use a window count that disappears on an empty out-of-range page. Future group totals/facets/suggestions use this same audience contract, including opt-in fields. A public manufacturer/region option must be reachable from an eligible published copy, not every catalog row.

Result target IDs belong to the feature entry layer. Task 7.2 must not fabricate links to owned-detail routes that do not exist yet; show usable results and expose only currently supported actions. Later owned-category routes can resolve the same IDs. Search does not add collection CRUD, navigation shortcuts, a palette, grid/list preference or public pages early.

## 8. Verified design evidence and limits

On 2026-10-13, an ephemeral SQL probe ran on the repository's pinned **PostgreSQL 16.15** through the existing disposable test-database provisioner. Existing migrations were applied only to that new container. `pg_trgm`, synthetic probe tables/functions/indexes and sample data existed only there; the container was removed. Application schema, migrations and data were untouched.

**Nineteen checks passed:** text-array helper/index eligibility; expected rejection of direct array_to_string in an index; multi-source AND matching; missing-term rejection; distinct-copy counting despite duplicate credits; in-title prefix matching; trigram spelling tolerance; literal serial preservation; nonfuzzy serial behavior; public serial exclusion; hidden-note exclusion; opt-in note matching only for published copies; hidden-defect exclusion; opt-in defect matching only for published copies; disabled-publication denial; unpublished-copy exclusion; prefix lexeme formatting with quotes/backslashes; composed/decomposed Unicode equivalence; and automatic selection of both GIN access paths on selective queries.

The index probe used **10,006 synthetic field rows** and ordinary `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`, without forcing index scans. It selected `probe_fts` and `probe_trgm`. One local run measured 0.377 ms for its selective FTS statement and 2.189 ms for its trigram statement. These validate expression/operator indexability on a toy corpus; they are not app latency targets, complete owned-graph benchmarks, concurrency measurements or proof of future public endpoint enforcement.

No application integration/browser tests are claimed for unimplemented search. Task 7.2 must test the real services, permissions, three owned identity graphs, projections, migrations and browser behavior. Formatting, internal document links and scope are checked for this documentation task.

## 9. Task 7.2 handoff and acceptance

Implement private collection search with the approved source paths and typed contracts. Add only the SQL extension/helper/indexes justified by representative query plans through a new migration; never edit applied migrations or use db push. Verify fresh replay, idempotent deploy, extension availability and preservation of existing constraints/triggers. A production database role that cannot install pg_trgm needs an explicit deployment provisioning step; do not fall back to an external engine or silently remove fuzzy matching.

Before completion, verify:

- All three owned categories; identical copies; multiple companies/markets/defects; missing relationships; archived-but-referenced identity; incomplete records; company roles and market scope.
- Names and real alias fields, editions/printing labels, variant context, identifiers/serial zeros and punctuation, private notes, defect descriptions and private repair notes.
- Exact/token/prefix/typo ordering, cross-field AND, repeated terms, acronym/short-query behavior, accented/mixed-language text, punctuation-only input, limits, literal wildcard escaping and hostile query syntax.
- Current grants/sessions for all read roles; denial of anonymous/revoked access and caller-supplied policy fields; parameterized SQL and redacted failures.
- Separate public-query contract tests: disabled museum, unpublished copies, hidden notes/defects/serials/repair notes, explicit opt-in fields and signed-in administrators on public surfaces. Altering hidden data must not change public hits, order, counts or suggestions. Do not add the public endpoint ahead of its assigned phase.
- Transactional freshness after canonical and owned edits; count/paging deduplication; no limiting away relevant owned candidates; empty out-of-range pages; deterministic tie-breaks; no private vectors/excerpts/locators in DTOs.
- Representative complete-query EXPLAIN plans on hobby-sized and larger fixtures, not only isolated text predicates. Confirm join/index use where useful, tolerate small-table scans, and measure common-term and prefix cases before considering denormalization.
- Desktop/mobile browser journeys with real auth/database; meaningful loading/idle/empty/error states; keyboard-accessible controls; cancelled/stale request handling and no raw private query in URLs or logs. The command palette and grid/list/filter UIs remain Tasks 7.3–7.5.

The accepted high-level architecture is PostgreSQL full-text plus narrowly scoped trigram matching over live normalized relations, with physical-copy results and separate audience-safe queries. Larger infrastructure or a denormalized search corpus requires measured evidence and a deliberate follow-up design.
