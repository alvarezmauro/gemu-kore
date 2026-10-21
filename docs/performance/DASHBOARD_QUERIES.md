# Dashboard queries — Task 17.2

The private dashboard keeps its existing counts and presentation while reducing the six count calls to one aggregate query. The request still revalidates current permissions inside a Repeatable Read transaction; the data reads return at most one aggregate row, nine recent identities and eight photo rows. Authorization reads are separate from these three data reads.

## Query shape

- `countsQuery` scans `collection_item` once, using filtered aggregates for the three categories and confirmed boxes. A scalar aggregate counts distinct `collectionItemId` values among ACTIVE defects once. The defect foreign key guarantees the copy exists. Multiple defects on one copy contribute one; accepted/repaired records do not contribute. Counts are checked before converting PostgreSQL bigint values to JavaScript numbers.
- `recentQuery` materializes only the nine newest IDs using the existing `(createdAt,id)` index in reverse order. Typed lateral lookups hydrate names through the owned subtype keys, so canonical joins cannot expand into collection-wide hydration. The service retains eight rows and uses the ninth as the overflow sentinel.
- `cardPhotosQuery` fetches only IDs and photos for the eight displayed copies. It shares the existing collection-card SQL projection for ready display images, primary ordering, excluded media types and thumbnail derivatives. It avoids the broader card query's unused defect counts and producer joins. Empty pages skip this read.

The existing indexes support bounded identity/photo reads. Full-collection aggregates still require database work proportional to the relevant rows; this change does not claim constant-time exact counts. No schema migration, new index, cache, dependency or background process was introduced.

## Recorded sample

[Machine-readable evidence](DASHBOARD_QUERY_EVIDENCE.json) records a synthetic disposable PostgreSQL 16 fixture with 6,012 owned copies, 2,405 defect records, 607 photo bindings and 1,821 assets. The eight newest copies have original/display/thumbnail dependency graphs. Tables were analyzed normally, with no forced planner settings.

| Read                                         | Returned rows | Execution time | Shared buffers accessed |
| -------------------------------------------- | ------------: | -------------: | ----------------------: |
| Previous six count SQL equivalents, combined |             6 |       5.868 ms |                   2,161 |
| Consolidated counts                          |             1 |       2.266 ms |                     391 |
| Recent identities                            |             9 |       0.437 ms |                      73 |
| Visible photos                               |             8 |       0.506 ms |                     201 |

The recent read uses `collection_item_createdAt_id_idx` backward for nine IDs. Each of the three owned subtype indexes serves three lookups of one row in this mixed fixture. Photo reads use the existing collection-media and asset-dependency indexes and omit defect/producer/family summary joins.

These are one warm-cache `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` sample, not production latency guarantees. The baseline SQL computes the same values as the prior Prisma count calls; timings exclude network and application overhead. Exact times vary with hardware, load, cache state and data distribution. Tests enforce semantic results and bounded plan shape, rather than a millisecond target. The saved JSON includes planning times and index names.

## Reproduce and regress

Run from the repository root with Docker available:

```sh
DASHBOARD_QUERY_REPORT=1 pnpm test:integration tests/integration/dashboard.test.ts
```

The integration harness creates and removes its own database. The scale helper additionally requires the disposable test database name; it never seeds or analyzes the personal database. The environment flag explicitly overwrites the evidence JSON; update the table above when publishing a new sample. Without the flag, tests verify plans without changing tracked evidence.

The dashboard integration suite also checks empty and failed reads, duplicate copies/defects, null box values, retained archived identities, deterministic recent order, photo privacy, current roles/grants/sessions and snapshot consistency during a concurrent copy deletion. Existing collection browsing/card-photo regressions cover the shared resolver's primary selection, thumbnail fallback and private-field exclusions. Dashboard/access browser checks exercise the real authenticated server-rendered page and refresh behavior on desktop/mobile, including JavaScript-free access.
