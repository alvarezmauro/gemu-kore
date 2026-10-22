# Playwright critical paths

Task 19.3 provides one repeatable critical-path gate across the established application. Run it from the repository root with Docker running and Playwright Chromium installed:

```sh
pnpm test:e2e:critical
```

The command delegates to the existing isolated authenticated-browser runner and selects test titles containing `@critical`. It runs 27 scenarios in both desktop and mobile Chromium: **54 checks across 14 files**. Twenty-three scenarios reuse established tests without changing their assertions; four new scenarios cover configured login and the publication lifecycle for console, game and accessory copies. The unfiltered browser suites remain available.

## Coverage map

Counts below include both Chromium projects. Each selected scenario appears in one row; several also exercise related boundaries.

| Task area         | Checks | Evidence                                                                                                                                                                                                                                                                                                   |
| ----------------- | -----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login             |     10 | [Access](../../tests/access-e2e/access.spec.ts): configured anonymous entry, generic callback-error recovery, current enabled ADMIN/EDITOR/VIEWER sessions and real signout.                                                                                                                               |
| Authorization     |      4 | [Access](../../tests/access-e2e/access.spec.ts): forged role/email headers cannot supply a missing grant; the same browser session observes changed, disabled, restored and deleted grants.                                                                                                                |
| Console CRUD      |      6 | [Creation](../../tests/access-e2e/consoles.spec.ts) and [management](../../tests/access-e2e/console-crud.spec.ts): save a private copy with defects/photos/overrides, edit/reidentify one copy, preserve siblings, reject stale changes and confirm deletion.                                              |
| Game CRUD         |      4 | [Creation](../../tests/access-e2e/game-creation.spec.ts) and [management](../../tests/access-e2e/game-crud.spec.ts): select a canonical release, retain personal observations/photos, edit/reidentify and delete only the confirmed copy.                                                                  |
| Accessory CRUD    |      2 | [Accessory copies](../../tests/access-e2e/accessory-copies.spec.ts): create, edit/reidentify and delete a copy with real photo/model uploads while retaining canonical records and stored assets.                                                                                                          |
| Location CRUD     |      4 | [Locations](../../tests/access-e2e/locations.spec.ts): create/reload a hierarchy, rename/move/reorder/delete locations and update descendant breadcrumbs.                                                                                                                                                  |
| Photo upload      |      2 | [Media](../../tests/access-e2e/media.spec.ts): upload actual bytes, inspect the prepared private image, edit classification/descriptions and remove only the selected use.                                                                                                                                 |
| Search            |      4 | [Search](../../tests/access-e2e/search.spec.ts): all categories, partial names/misspellings and private serial/note POST queries without raw private text in results or navigation.                                                                                                                        |
| Filters           |      4 | [Filters](../../tests/access-e2e/filters.spec.ts): bookmark/reload/Back/Forward restoration and nested/unassigned locations with individual removal and clear-all.                                                                                                                                         |
| Enrichment        |      4 | [Enrichment](../../tests/access-e2e/enrichment.spec.ts): editor review → administrator acceptance → refresh an existing draft without losing photos; review ownership, viewer denial and keyboard ignore.                                                                                                  |
| Public collection |      2 | [Public management](../../tests/access-e2e/public-home.spec.ts): review widening impact, invalidate old approvals, republish one copy and explicitly remove approval.                                                                                                                                      |
| Privacy           |      8 | [Transport canaries](../../tests/access-e2e/public-privacy.spec.ts) and [publication lifecycle](../../tests/access-e2e/critical-publication.spec.ts): inspect anonymous/role-safe HTML and Flight, then publish, preserve no-op approval, edit to private, freshly approve and delete every owned subtype. |

## New lifecycle journeys

Each subtype starts with its own private copy and a separate anonymous browser context. The administrator approves the exact copy through the publication UI; the visitor receives only canonical, settings-allowed content. Saving an unchanged private edit preserves approval. A meaningful private-note edit immediately makes the copy unavailable on fresh public requests and reloads. A fresh explicit review republishes it without exposing the hidden note; deleting that copy removes its public route while another independently approved copy remains available. No publication, edit or deletion is performed directly by a fixture during these journeys.

The new configured-login scenario verifies the real private redirect, provider-button availability and generic callback-error/denial recovery. It does not invoke a live OAuth provider.

## Harness and evidence boundaries

The gate builds and runs the production application through `playwright.access.config.ts`. It uses the same single-worker desktop/mobile projects, fresh PostgreSQL migrations, disposable MinIO, one-day local TLS proxies and real Secure session-cookie validation as `pnpm test:e2e:access`. The test runner refuses personal database configuration, blanks live metadata credentials and cleans up its resources. Application behavior, authorization, public query policy and runner timeouts are unchanged.

Authorized browser identities start from signed fixture sessions; this verifies the application session/allowlist boundary rather than live provider consent. Provider normalization and OAuth callback handling retain their separate unit/integration coverage. Enrichment uses deterministic retained provider evidence, and uploads use real synthetic image/model bytes against disposable storage. No live provider catalog or personal collection is required.

Useful focused commands:

```sh
# Enumerate the selected desktop/mobile cases (the isolated runner still prepares and cleans up fixtures).
pnpm test:e2e:critical --list

# Run one project, or only the three new publication lifecycle scenarios.
pnpm test:e2e:critical --project=chromium
pnpm test:e2e:critical critical-publication.spec.ts

# The complete authenticated browser suite remains independently available.
pnpm test:e2e:access
```

HTML reports, screenshots and retained failure traces use the existing ignored `playwright-report/` and `test-results/` folders. A successful critical gate does not claim the unselected browser edge cases, cross-browser certification or live OAuth/provider availability. Additional edge-case expansion belongs to Task 19.4.

## Verification — 2026-10-22

All **54 critical checks passed** in the full desktop/mobile run, including eight checks from the four new scenarios and 46 selected existing checks. The real production build, lint, typecheck, all 1,459 unit/component cases, formatting, local documentation links/fences and whitespace checks pass. PostgreSQL/MinIO and local TLS resources were removed by the runner. Existing CRUD, ownership, privacy and freshness assertions were retained; no failure, assertion or existing timeout was waived.

The standalone integration/storage suites were not repeated for this browser-tests-and-command change; the browser harness itself exercises real disposable PostgreSQL/MinIO. Task 19.2's independently reproduced large-search benchmark timeout remains recorded in the [integration verification notes](TESTING.md#task-192-integration-expansion). This functional browser gate does not resolve that existing performance limitation. Task 19.4 has not started.
