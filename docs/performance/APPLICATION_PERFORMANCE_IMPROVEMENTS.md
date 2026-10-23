# Application performance improvements

Task 21.2 implements the three measured findings in the [Task 21.1 investigation](APPLICATION_PERFORMANCE_REVIEW.md). Its [database](APPLICATION_DATABASE_EVIDENCE.json) and [browser](APPLICATION_BROWSER_EVIDENCE.json) evidence remain unchanged. Implementation measurements are stored separately in [database after evidence](APPLICATION_DATABASE_AFTER.json) and [browser after evidence](APPLICATION_BROWSER_AFTER.json).

These are local, synthetic observations with the same disposable PostgreSQL corpus and production browser methodology. Database probe timings are individual observations; browser route timings have three fresh-context samples per route and device profile. They are not deployment capacity, Core Web Vitals or physical-phone claims.

## P01 — filtered search

Filtered facts now carry their canonical title, owned type and sort keys together. The page relation no longer independently joins the large `titles` and `controls` sets. Canonical matching, owned links, filters, ranking, UUID ties and bounded post-page context hydration retain their existing contracts.

The complete-term threshold uses `count(*) >= term count`. `best` contains at most one row per requested ordinal, so this is exactly equivalent to the previous equality predicate. PostgreSQL's aggregate equality selectivity had reduced broad matches to an estimate near one row, encouraging repeated nested-loop scans; the threshold and combined projection allow a hash join over those matches. No index, migration, global planner setting or search deadline was changed.

The existing 3,004-copy complete-search regression retains its two-second SQL deadline and now also rejects large repeated title/control scans or join-filter work. Its selective, typo, multi-source, common-word and short-prefix cases pass. Separate bare SQL and instrumented EXPLAIN observations remain explicitly labeled in the evidence; neither is substituted for the other.

## P02 — contextual public assets

The request-local admission loader coalesces asset-node requests into batches of at most 128 IDs. Sibling inputs are fetched together, then checked in the existing DFS order, preserving cycle detection, depth 16, 128 unique nodes and the 129th-edge rejection sentinel. A per-root discovery budget also bounds speculative reads across branching graphs, and prefetch never crosses the depth boundary. Database batches run serially on the transaction connection. Missing assets, non-ready/restricted ancestors, unsupported edges and unsafe display metadata still fail closed.

Galleries examine ordered windows of 32 uses and retain the first 24 eligible images, the 25th-image lookahead and the first eligible model. They continue past invalid entries; after the image lookahead is full, later image graphs are skipped while model discovery continues. SEO chooses the first eligible catalog image in the same order. Component discovery shares one admission loader across bounded groups of twelve candidates and all their slots, including candidates after invalid descriptors.

Every loader belongs to the current Repeatable Read transaction. There is no cross-request rights or authorization cache. Contextual delivery, SEO and viewer requests continue to recheck current publication, exact use, policy, review and recursive source rights; protected responses retain no-store behavior.

## P03 — copy management choices

Photo and defect management initially return at most 25 choices, with one extra database row used only to determine whether another page exists. The selected copy is resolved separately and retained by the selector when it lies outside the current page. Empty-query paging selects a bounded ordered range before subtype hydration; text lookup selects at most 26 IDs before hydrating their labels.

A shared small Client Component keeps the native “Collection copy” select and “View copy” GET form, and adds explicit search, previous and more controls. Search uses a read-only Server Action, keeps free text out of URLs/storage, and revalidates current private access within the read transaction. The lookup accepts only bounded query/page fields and searches displayed names, platform, edition and copy UUID; notes and serials are excluded. SQL wildcard characters are escaped. Stable created-time/UUID ordering, archived owned identities, no-results recovery, the retained chosen copy and changed-access failures have regression coverage. Native GET paging also works without JavaScript, preserving the viewed copy while making all pages reachable. Search remains disabled until hydration, with an explicit static-page explanation, so private text never falls back to a URL submission. Page parameters are validated server-side, including repeated/invalid URL values. Existing photo/defect authorization and mutation rules are unchanged.

## Database comparison

The final isolated probe uses the same 3,004 complete owned graphs, unchanged two-second search budget, 1/12/30 independently approved photo graphs and 34/3,004-copy selector sizes as the baseline. Timings below are individual local observations, not distributions or SLOs.

| Observation                                   |                        Task 21.1 baseline |                         Task 21.2 implementation |
| --------------------------------------------- | ----------------------------------------: | -----------------------------------------------: |
| Filtered common-word bare SQL                 |                                  1,440 ms |                                           267 ms |
| Filtered short-prefix bare SQL                |                                  1,513 ms |                                           340 ms |
| Filtered common-word EXPLAIN                  |     timed out at 2 s; diagnostic 2,555 ms |                                266 ms within 2 s |
| Filtered short-prefix EXPLAIN                 |     timed out at 2 s; diagnostic 2,561 ms |                                333 ms within 2 s |
| Repeated title/control scans on broad matches | about 3,002 rows × 3,000/3,002 loops each | removed; largest join-filter removal count 3,002 |
| Common-word shared-buffer accesses            |                                    91,077 |                                           67,204 |
| Public detail SQL events, 1 / 12 / 30 photos  |                            57 / 101 / 173 |                                     57 / 57 / 57 |
| Initial choices, 34 / 3,004 copies            |                                34 / 3,004 |                                          25 / 25 |
| Management DTO bytes, 34 / 3,004 copies       |                           3,575 / 326,498 |                                    2,718 / 2,917 |
| Management elapsed time, 34 / 3,004 copies    |                               42 / 184 ms |                                       47 / 43 ms |
| Management SQL events, either corpus          |                                        33 |                                               36 |

The large selector DTO falls by **99.1%**. The three extra management SQL events revalidate current private access inside the snapshot, in addition to the existing initial check; reads remain bounded independently of collection size. The probe deliberately reports that small-corpus latency/query count did not improve. One-photo gallery latency remains about 75 ms; the 12/30-photo cases are about 51/54 ms, with constant query counts. Shared/DAG component and sibling-input behavior is additionally covered by deterministic admission regressions rather than claimed as a separate production latency measurement.

## Production browser comparison

All 48 inactive-route samples still omit the renderer chunk and canvas. The renderer remains **1,011,263 raw / 270,732 gzip bytes**, below the unchanged ceilings; activation, zero idle draws, offscreen pause, reduced motion and drawing-buffer bounds pass on both browser profiles. The JavaScript gzip estimates are unchanged in all sixteen route/profile groups. Explicit activation is about 1,328 ms desktop / 1,316 ms emulated mobile, compared with the baseline 1,342 / 1,335 ms; these single observations do not establish a loading-speed improvement.

The table shows **median (minimum–maximum)** milliseconds from three fresh contexts per route/profile, before → after. Script CPU is Chromium's accumulated `ScriptDuration` over the probe's settled window, not input responsiveness or a Core Web Vital. Local timing variation is visible; these samples do not establish a general navigation-speed improvement or deployment SLO. Full payload, DOM, heap and theme-action observations remain in the evidence.

| Route                               | Profile         | TTFB ms, before → after       | Script CPU ms, before → after |
| ----------------------------------- | --------------- | ----------------------------- | ----------------------------- |
| `/app`                              | Desktop         | 45 (43–66) → 45 (40–66)       | 150 (141–169) → 145 (140–146) |
| `/app/collection`                   | Desktop         | 50 (43–52) → 51 (48–52)       | 139 (134–146) → 138 (134–153) |
| `/app/consoles/[console-id]`        | Desktop         | 62 (62–86) → 61 (57–112)      | 127 (126–128) → 127 (124–144) |
| `/app/consoles/new`                 | Desktop         | 40 (36–54) → 37 (35–53)       | 118 (116–121) → 121 (119–124) |
| `/app/games/[game-id]`              | Desktop         | 131 (105–182) → 125 (106–184) | 133 (130–136) → 132 (130–133) |
| `/collection`                       | Desktop         | 41 (40–101) → 41 (41–119)     | 100 (95–124) → 99 (99–112)    |
| `/collection/consoles`              | Desktop         | 40 (38–46) → 41 (37–42)       | 70 (70–70) → 72 (69–73)       |
| `/collection/consoles/[console-id]` | Desktop         | 90 (77–105) → 69 (64–143)     | 109 (105–115) → 104 (102–105) |
| `/app`                              | Emulated mobile | 46 (43–50) → 46 (41–47)       | 139 (138–140) → 136 (134–147) |
| `/app/collection`                   | Emulated mobile | 48 (45–54) → 50 (44–53)       | 128 (126–130) → 126 (126–142) |
| `/app/consoles/[console-id]`        | Emulated mobile | 60 (58–82) → 58 (56–112)      | 120 (120–124) → 119 (118–122) |
| `/app/consoles/new`                 | Emulated mobile | 40 (35–50) → 36 (35–47)       | 119 (117–128) → 117 (117–119) |
| `/app/games/[game-id]`              | Emulated mobile | 117 (96–124) → 126 (101–151)  | 125 (124–126) → 127 (124–130) |
| `/collection`                       | Emulated mobile | 41 (40–62) → 38 (36–57)       | 102 (94–105) → 98 (94–100)    |
| `/collection/consoles`              | Emulated mobile | 37 (36–41) → 40 (39–44)       | 67 (65–67) → 72 (69–79)       |
| `/collection/consoles/[console-id]` | Emulated mobile | 76 (73–82) → 72 (66–95)       | 100 (99–106) → 101 (101–102)  |

## Verification

Completed with the following passing checks:

- All **1,478 unit/component cases** across 111 files, including the native paging fallback and final speculative-read bounds.
- All **676 integration cases** across 29 files, including the formerly failing complete-search benchmark. The final management/repository rerun passes all 88 cases, and the final isolated diagnostic case passes with zero search-budget cancellations. All 48 public-collection integration cases pass again after the last prefetch guard.
- All **60 workflow/accessibility browser checks**, followed by **30 final selected checks**: eight copy-selector journeys including JavaScript-free desktop/mobile paging, two affected accessibility journeys, ten public privacy/model/artwork/SEO checks, and ten performance/3D checks. The selections overlap; they cover 84 distinct cases, with zero skipped, flaky or unexpected final results. Browser evidence was captured after the main improvements/native fallback; the subsequent prefetch guard changes only invalid or oversized graph admission and is covered by the final unit/public-integration reruns.
- Lint, typecheck, production builds, formatting, documentation links/fences, diff whitespace and the renderer bundle budget. Desktop and 320px mobile screenshots were inspected. Disposable database/storage/TLS resources were removed.

The React component review retains Server Component pages, a narrow Client Component, server-authorized/validated lookup, bounded serialization, native labeled controls and progressive page navigation. No new client library or animation is introduced. The original investigation evidence is retained; current evidence identifies the source commit plus uncommitted working-tree changes.

No dependency, migration, index, production deadline, cross-request permission cache or renderer-budget change is included. Deployment, physical-device measurements, real-photo/network corpora and capacity testing remain outside this local comparison. The next task is **22.1 — Production Docker**, only when requested.
