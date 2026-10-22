# Browser edge-case coverage

Task 19.4 adds six recovery and privacy-transition journeys to the established production-browser harness. Each runs in desktop and mobile Chromium, for **12 checks**:

```sh
pnpm test:e2e:edge
```

The command selects titles containing `@edge`. The existing [54-check critical gate](CRITICAL_PATHS.md) retains its selection and assertions, and the unfiltered authenticated suite includes these additions automatically.

## Added journeys

| Journey                         | Desktop/mobile checks | Evidence                                                                                                                                                                                                                                                                  |
| ------------------------------- | --------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lost console-save reply         |                     2 | The real save commits one private copy and its initial defect before the reply is lost. A later VIEWER grant cannot recover through a privileged save or begin photo uploads. Restoring EDITOR access recovers the same copy and uploads the retained pending photo once. |
| Lost game-save reply            |                     2 | The same sequence retains the exact owned ID, selected release, serial, notes and defect, without creating a duplicate copy or losing the pending image.                                                                                                                  |
| Lost committed-photo reply      |                     2 | A real upload finishes storage, processing and attachment before its reply is dropped. The client stops the two-file queue; the ready private image is inspectable, the second file has not started, and after refresh the user uploads only that remaining file.         |
| Lost settings-save reply        |                     2 | Widening note disclosure commits policy and invalidates three approvals once. The client clears the confirmation, stale review is rejected, reload reads the committed setting, and freshly confirming a no-op does not repeat invalidation or advance policy revision.   |
| Lost copy-approval reply        |                     2 | The copy becomes publicly available despite the lost reply. Reload reads current approval, and the user explicitly reviews withdrawal instead of replaying an old decision; the selected route closes while another approved copy remains available.                      |
| Public form outlives its policy |                     2 | An anonymous filter form is submitted after location/defect/note disclosure is narrowed, then after the collection is paused. Fresh navigation and API reads enforce current policy, remove stale results/controls and keep hidden notes from matching.                   |

All cases are in [edge-cases.spec.ts](../../tests/access-e2e/edge-cases.spec.ts). They reuse the existing guarded fixtures. No schema, dependency, provider or runner-policy changes are required. The new copy-recovery journeys have a 90-second scenario budget; the photo case uses 60 seconds. Existing test and application limits are retained.

## Recovery correction

The lost copy-approval case exposed a broken recovery control in [item-publication.tsx](../../src/features/public-collection/components/item-publication.tsx). “Reload copy” previously linked to the current URL with `#copy-review`. That fragment-only navigation did not reload server state: the copy was publicly available while the review still displayed Private and the previous failure message. The control now uses the existing outline button to reload the page. The browser regression verifies the committed Published state after that reload and then explicitly reviews withdrawal.

## Failure simulation and evidence

The shared test helper forwards the original request with Playwright `route.fetch()`, waits for the real server reply, records its status and aborts delivery to the browser. It does not invent a successful payload or bypass authorization. Database readback and subsequent real browser actions verify what committed. Assertions stay outside the interception callback; a failed request cannot be mistaken for successful failure injection.

Public policy transitions use existing fixture commands to represent another actor changing policy while a visitor's form is open. The tested visitor still submits the real public form and API request. An already admitted view can remain visible until navigation; the checks concern subsequent requests under the current policy.

The harness builds the real application, applies migrations to disposable PostgreSQL and uses disposable MinIO with local TLS. Synthetic images travel through real upload/processing/delivery routes. Signed fixture sessions exercise current session/grant validation; live OAuth consent and live metadata-provider availability remain separate evidence boundaries. The runner cleans up its database, storage and TLS resources.

Focused commands:

```sh
pnpm test:e2e:edge --project=chromium
pnpm test:e2e:edge --grep 'lost-save recovery'
pnpm test:e2e:edge --list --reporter=list
pnpm test:e2e:critical --list --reporter=list
```

`--list` still prepares and cleans up the isolated harness. `--reporter=list` preserves an existing HTML run report while listing cases. Failures retain the standard screenshots and traces under ignored `test-results/`; normal HTML output goes to `playwright-report/`.

## Verification — 2026-10-22

All **12 checks passed** in a fresh desktop/mobile run after the recovery correction, with a real production build and disposable PostgreSQL/MinIO. The first run reproduced the fragment-only reload failure in both projects; a separate settings assertion was corrected to match the established zero-impact message. No existing assertion or timeout was relaxed. Lint, typecheck, all 1,459 unit/component cases, formatting, local documentation links/fences and whitespace checks pass. The critical selection remains 54 checks; the new edge selection contains twelve. The runner removed its disposable database/storage/TLS resources.

The standalone integration/storage suites were not repeated for this browser expansion and small client recovery change. The browser journeys themselves exercise real database, storage, authorization and public-query behavior. Task 19.2's independently reproduced large-search benchmark timeout remains recorded in the [integration verification notes](TESTING.md#task-192-integration-expansion); this task does not resolve that performance limitation. The unfiltered browser suite, cross-browser certification and live OAuth/provider availability are outside this run.
