# Application performance investigation — Task 21.1

Task 21.1 baseline retained below. The implementation and subsequent verification are recorded in [Task 21.2 — performance improvements](APPLICATION_PERFORMANCE_IMPROVEMENTS.md).

Investigation date: 2026-10-22. Source base: `956782d`; local changes contain diagnostic tools and evidence only. Requirements: `PROJECT_SPEC.md` §§101–107 and 117–120. Implementation of findings belongs to Task 21.2.

## Findings and implementation order

| ID  | Priority | Finding                                                                                                                                                                                                        | Task 21.2 action                                                                                                                                                                                                                                           |
| --- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P01 | High     | The complete filtered-search plan regression exceeds two seconds at 3,004 copies; bare common/prefix queries take about 1.4–1.5 seconds. Materialized title/control sets are scanned repeatedly before paging. | Change the query shape so matching IDs join title/control facts without repeated full scans. Retain ranking, complete filtering before paging, stable ties, market semantics, private/public boundaries and the existing deadline.                         |
| P02 | High     | Public detail media admission adds SQL work per distinct image/lineage node, including images beyond the displayed gallery.                                                                                    | Batch current asset/lineage reads inside the existing read-only transaction and share request-local admission work. Keep rights/review/publication checks and graph limits; preserve ordered admission, the 25th-image lookahead and first eligible model. |
| P03 | Medium   | Management copy selectors load the entire owned collection. Pagination in collection browsing does not bound these separate selectors.                                                                         | Add bounded, searchable copy choices for photo/defect management while preserving selected identity, role checks, keyboard operation and empty/error states.                                                                                               |

Client/bundle observations and acceptance checks are recorded below. Do not infer a missing index or introduce a shared cache from a slow read alone.

## Method and evidence

[Database evidence](APPLICATION_DATABASE_EVIDENCE.json) records actual Prisma SQL events, service durations, serialized DTO sizes and PostgreSQL `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` summaries. Its diagnostic client emits query events only in the disposable integration process. Statement hashes identify repeated SQL shapes; parameters, credentials and personal data are not recorded. Counts include transaction/control/authorization SQL, so they are SQL-event counts rather than one count per service call or per ORM operation.

Fixtures use PostgreSQL 16, actual migrations and complete owned root/subtype graphs. The media study uses metadata-only synthetic original/display graphs; no object-storage bandwidth is measured by that study. The browser study uses actual synthetic files in disposable MinIO and a production Next.js build over local TLS. Timing observations are local samples, not deployment SLOs or phone GPU measurements.

The [diagnostic integration case](../../tests/integration/performance-investigation.test.ts), [browser case](../../tests/access-e2e/performance-investigation.spec.ts) and [browser/build collector](../../scripts/collect-application-performance.ts) are reproducible and remain outside application imports. No application component, service, query, schema, index, dependency, pool policy or production deadline changes in this task.

## Query plans — P01

Locations: [search query assembly](../../src/server/repositories/search/query.ts), especially the `titles`/`page` joins, and [control facts/order](../../src/server/repositories/search/controls-query.ts).

The same 3,004-copy corpus as the established search plan regression contains four mixed copies and 3,000 complete synthetic game graphs. Normal ANALYZE runs on the four scale tables. Production search configuration disables JIT and retains the two-second statement limit; planner settings and indexes are not forced.

| Query     | Plain EXPLAIN execution | Bare filtered query elapsed | Filtered EXPLAIN execution | Filtered EXPLAIN deadline |
| --------- | ----------------------: | --------------------------: | -------------------------: | ------------------------- |
| `chrono`  |                50.22 ms |                   140.60 ms |                  211.82 ms | Within two seconds        |
| `fixture` |               342.76 ms |                  1440.36 ms |                2,554.66 ms | Timed out at two seconds  |
| `fi`      |               342.51 ms |                  1512.95 ms |                2,560.83 ms | Timed out at two seconds  |

Filtered reads use `type=game`, `sort=year-desc`, limit 20 and offset zero. Plain reads use the same text/page size. After a recorded cancellation, a **separate diagnostic-only** transaction allows up to fifteen seconds to obtain the full EXPLAIN. Filtered EXPLAIN timings for the two slow cases come from that separate diagnostic run. All six bare SQL probes completed within the normal deadline; the filtered common/prefix probes took about 1.4–1.5 seconds including local transaction/configuration work. These are core SQL observations, not full authenticated HTTP latency. EXPLAIN instrumentation overhead is material here: its cancellations do not establish that ordinary user requests timed out in this sample. Production settings and the existing regression remain unchanged.

For `fixture`, the final page join estimates one row but processes 3,000 matches. Its `titles` and `controls` CTE scans each return about 3,002 rows on **3,000 loops**, and each enclosing join removes **9,003,000** candidates. Filtered reads access about **91,077 shared blocks**, versus 1,234 for plain search. This is repeated join work inside one SQL statement, distinct from application N+1 round trips. Node timings are inclusive and must not be added together. The evidence supports investigating these joins and row estimates; it does not establish that an additional base-table index will solve the problem.

The unchanged existing test, “measures complete search plans with representative owned graphs and index-backed canonical matches,” was rerun and still fails in the filtered EXPLAIN with PostgreSQL `57014`. The failure already documented in Tasks 14.2/19.2 is an open Task 21.2 finding. It is not skipped, waived, or counted as a performance pass. The selective and multi-source plain-query observations printed before that failure remain index-backed.

## SQL growth and selectors — P02/P03

Locations: [public admission/service](../../src/server/services/public-collection/media.ts), [public media repository](../../src/server/repositories/public-collection/media.ts), [component admission](../../src/server/services/public-collection/components.ts), [unbounded copy choices](../../src/server/repositories/collection/items.ts) and the [photo-management service](../../src/server/services/collection/media.ts).

| Read                     | Fixture / output                         | SQL events | Local service duration |
| ------------------------ | ---------------------------------------- | ---------: | ---------------------: |
| Private collection       | One returned copy                        |         11 |               63.19 ms |
| Private collection       | Twenty returned copies                   |         11 |               40.98 ms |
| Dashboard                | Eight recent copies                      |          8 |               35.65 ms |
| Public console detail    | 1 approved photos / 1 displayed          |         57 |               74.34 ms |
| Public console detail    | 12 approved photos / 12 displayed        |        101 |               98.37 ms |
| Public console detail    | 30 approved photos / 24 displayed        |        173 |              177.52 ms |
| Photo-management choices | 34 choices / 3,575 serialized bytes      |         33 |               41.82 ms |
| Photo-management choices | 3,004 choices / 326,498 serialized bytes |         33 |              183.81 ms |

The private collection/card hydration is batched: increasing the returned page from one to twenty does not add SQL events. The dashboard also uses bounded recent/photo hydration, consistent with the earlier [6,012-copy dashboard study](DASHBOARD_QUERIES.md). These observations provide no reason to rewrite the dashboard or add a count cache.

For public media, eleven extra photos add 44 SQL events and eighteen further photos add 72: **four SQL events per unique original/display graph** in this fixture. `assetAdmission` already memoizes nodes within its invocation, but `publicItemMedia` visits each distinct use and its ancestry sequentially. The repository's asset-node projection also loads dependency rows. The slope continues after the displayed 24-image cap. Component slots use similar admission work, with separate per-component memo scopes; that is a source-inspection extension, not a separately measured component-scaling result.

The copy selector has a different problem: query count stays constant while returned rows and serialized size grow. `listCollectionItemOptions` has no bound and feeds the photo manager; the defect manager shares this repository. The numbers above are serialized service DTO bytes, not compressed HTML or browser wire bytes. A bounded choice workflow should retain access to all owned copies through search/paging; silently truncating a select would lose functionality.

## React boundaries, client JavaScript and bundles

Locations: [private server layout](../../src/app/app/layout.tsx), [command palette](../../src/features/search/components/command-palette.tsx), [auth client](../../src/features/auth/client.ts) and [viewer wrapper](../../src/components/three/model-viewer.tsx).

[Browser and build evidence](APPLICATION_BROWSER_EVIDENCE.json) contains **48 navigations**: three fresh contexts for each of eight routes in desktop Chromium and an emulated Pixel 7. The table gives medians. The production server and local database are warm; there is no network/CPU throttling. The settled-window sample includes normal link prefetch and a theme-menu interaction. JS gzip sizes are recompressed estimates, not actual network transfer totals or exclusively critical-path bytes.

| Route                               | Desktop TTFB | Mobile-emulated TTFB | JS gzip estimate | Mobile script work |
| ----------------------------------- | -----------: | -------------------: | ---------------: | -----------------: |
| `/collection`                       |      41.4 ms |              41.3 ms |        206.9 KiB |           102.4 ms |
| `/collection/consoles`              |      40.1 ms |              37.0 ms |        181.1 KiB |            66.8 ms |
| `/collection/consoles/[console-id]` |      90.0 ms |              76.0 ms |        284.9 KiB |           100.3 ms |
| `/app`                              |      44.9 ms |              46.4 ms |        352.2 KiB |           138.6 ms |
| `/app/collection`                   |      50.3 ms |              48.1 ms |        358.7 KiB |           127.8 ms |
| `/app/consoles/new`                 |      39.9 ms |              39.8 ms |        362.7 KiB |           119.4 ms |
| `/app/consoles/[console-id]`        |      62.5 ms |              60.1 ms |        369.1 KiB |           120.0 ms |
| `/app/games/[game-id]`              |     131.1 ms |             116.7 ms |        373.8 KiB |           125.3 ms |

HTML gzip estimates range from about 6.4 to 13.3 KiB in this small fixture. The browser records transfer sizes separately. Theme-menu action measurements are input/actionability/opening samples taken after the heading appears, not Core Web Vitals or a claim of time to interactive. Script duration is Chromium's cumulative script-work counter for that page; heap size is a point-in-time value, not a retained-memory/leak result.

The largest non-renderer build chunk is **391,191 raw / 90,897 gzip bytes** and contains schema-library code. It is requested by all sampled private routes and the inactive public console detail, while the public home/category omit it. Manifest/source inspection shows eager search/client validation on private pages and shared descriptor schemas on inactive detail wrappers. Private sign-out also imports its client SDK eagerly. The manifest lists entrypoints; it does not attribute the large chunk to any one dependency. This is a useful candidate for a controlled split experiment; the current measurements do not isolate each dependency's byte contribution or prove a safe split's savings. Preserve descriptor/input validation and accessible first activation. Framework/shared chunks and private-only functionality explain part of the public/private difference; the table alone does not establish unnecessary hydration.

Excluding test files, the source inventory has 38 application TSX files with no top-level `use client`, 35 shared component TSX files (18 client) and 83 feature TSX files (57 client). These are file counts, not hydration-cost estimates. Root theme and private command-palette providers accept server-rendered children; their presence does not move the entire route's data logic into the client. Feature query adapters remain server-only, and no inspected UI component accesses Prisma.

The private layout eagerly imports the command-palette shell, which imports its search session, command primitives, schemas and visual helpers. This is a candidate for further splitting only if the measured initial payload warrants it. Client validation and interactive forms are expected; a large schema/vendor chunk alone is not a correctness defect. Shared animation and stateful image-error fallbacks are localized client islands.

## R3F and assets

The viewer keeps a client-only dynamic runtime behind explicit activation. R3F uses demand rendering while idle, pauses offscreen/hidden work, stops automatic rotation under reduced motion, caps its drawing buffer and owns session-scoped disposal. The existing [3D performance investigation](3D_PERFORMANCE.md) contains prior instrumented and physical iPhone observations, including their native-memory limitation; those historical measurements are not relabeled as a fresh device run.

Uploads retain originals and generate oriented, metadata-stripped WebP derivatives at 320px and 1,600px without enlargement. Private cards select thumbnails with display fallback. Public contextual images deliberately bypass the shared optimizer, and current media routes recheck authorization/publication/rights and use no-store. Those privacy and revocation constraints are performance acceptance requirements. Do not propose globally caching these responses or enabling the optimizer for revocable private/contextual URLs.

The fresh renderer measurement is **1,011,263 raw / 270,732 gzip bytes**, under the existing 1,280 KiB raw / 320 KiB gzip ceilings. All 48 inactive route samples omit that identified renderer chunk and have no canvas. Explicit activation of a real uploaded synthetic GLB reaches ready in about **1,342 ms desktop / 1,335 ms emulated mobile**, including authorization, transfer, parsing and the first rendered frame; these are single activation observations, not phone loading targets. The six existing desktop/mobile performance checks for lazy loading, zero idle/offscreen work, live reduced motion and oversized drawing-buffer bounds also pass. The sentinel guard identifies the renderer/loader chunk, not every byte of wrapper/schema code or every possible future 3D dependency.

Font assets are self-hosted, variable weights are bounded, and font display uses swap. Normal collection pages do not require model transfers or a canvas. Images/GLBs in this browser fixture are small synthetic assets; large real-photo delivery, constrained mobile networks and physical device memory need separate deployment/device samples.

## Task 21.2 acceptance checks

1. Reproduce P01 at the unchanged two-second deadline and make the existing complete-query regression pass. Retain exact/typo/multi-source/common/prefix semantics, all sorts/filters, pagination ties, current indexes and privacy tests. Compare plan loop counts as well as latency; do not raise deadlines or disable the check.
2. For P02, compare 1/12/30 distinct photos and shared lineage/components. SQL growth should be bounded by batches rather than one read per node. Re-run public approval/revocation, restricted-ancestor, cyclic/oversized lineage, hidden-field, model/artwork and concurrent-policy tests. Do not introduce a cross-request authorization cache.
3. For P03, measure 34/3,004 choices while keeping the initial payload bounded. Test current-choice preservation, later pages, no results, changed permissions and all photo/defect flows on phones and keyboard.
4. Preserve zero renderer/model requests on grids and inactive details, existing renderer bundle ceilings, demand rendering and disposal. Any client split needs a measured byte/work benefit and accessible first-use/error behavior.
5. Re-run the same production browser and database probes on the implementation. Preserve methodology labels and compare distributions, not a single fastest sample.

## Reproduce and verification

Run Prisma-generating/build commands sequentially in this checkout. Docker, Chromium and OpenSSL are required. The standard isolated runners reject personal database configuration and remove their disposable resources.

```sh
PERFORMANCE_INVESTIGATION_REPORT=1 pnpm test:integration tests/integration/performance-investigation.test.ts
pnpm test:integration tests/integration/search.test.ts -t 'measures complete search plans'
PLAYWRIGHT_JSON_OUTPUT_NAME=/tmp/gemukore-performance.json pnpm test:e2e:access performance-investigation.spec.ts model-performance.spec.ts --grep '@performance|keeps renderer chunks|settles to zero idle draws|bounds drawing-buffer resolution' --reporter=list,json
pnpm exec tsx scripts/collect-application-performance.ts /tmp/gemukore-performance.json
pnpm three:bundle
```

The second command currently fails for P01. The diagnostic integration case records that cancellation and uses its separate EXPLAIN allowance to reveal why; a passing diagnostic harness is not a passing performance budget. The report flag explicitly overwrites the database evidence. The collector rejects failed/incomplete browser reports and records the current built chunks/manifests, so run it before another build replaces `.next`.

The final diagnostic integration case passes and records all six bare core SQL probes completing at the unchanged deadline, plus two EXPLAIN cancellations. The existing complete-search plan regression remains nonpassing as described above; its focused run returned one failure with 101 unrelated cases deselected. A combined diagnostic/regression run had one passing diagnostic and that one existing failure. No check is waived or relabeled as green.

All **ten selected browser cases** pass, with zero skipped, flaky or unexpected results: four new desktop/mobile diagnostic cases (48 route samples and two real model activations) plus six existing 3D lifecycle/buffer checks. The collector and existing renderer budget check pass. All **1,459 unit/component cases**, lint, typecheck, production build, formatting, local documentation links/fences and diff whitespace checks pass. Disposable database/storage/TLS resources were removed. Initial diagnostic-only fixture/selector errors were corrected without changing application behavior or relaxing a limit.

No application optimization has been implemented. Concurrency/load testing, real network transfer budgets, Core Web Vitals, real-photo corpora and fresh physical-device measurements remain outside this local sample. These measurements support the prioritized changes above and provide their baseline; they do not certify deployment capacity.
