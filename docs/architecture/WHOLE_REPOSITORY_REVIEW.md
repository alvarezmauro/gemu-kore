# Whole repository review

Task 23.1 · 2026-10-23 · Reviewed application commit `e81b4ea`

The implemented architecture is sound for the intended shared collection and
single application instance. Catalog identities remain separate from physical
copies; authorization, public projections, provider adapters and deferred 3D have
meaningful boundaries and extensive regression coverage. No new Critical issue,
authorization bypass, private-data disclosure or catalog/copy corruption was
demonstrated in the reviewed paths.

**Production approval remains withheld.** Two High deployment assessments from
Task 22.3 remain open. This review adds two justified Medium findings: repeated
database lineage expansion and missing structured application diagnostics. One
further Medium finding carries forward the operator-toolchain advisories.
Passing application checks do not clear dependency advisories.

This task produces a review and a Task 23.2 handoff. It changes no application
code, dependency, configuration, schema, migration or deployment.

## Scope and evidence

Reviewed `PROJECT_SPEC.md`, the Task 23.1 instructions and accepted architecture
documents against the active source tree, Prisma schema and committed migrations.
Inspected authentication/grants/permissions, creation and editing for all three
owned types, catalog history, locations, defects, uploads/completion/deletion,
storage transport, search/dashboard, enrichment and providers, public
data/media/SEO/publication, viewer resource ownership, production packaging and
backup/recovery. Used the PostgreSQL review skill for relational/query/locking
checks; this does not introduce Supabase or change the self-hosted architecture.

The review combines source inspection, existing regression suites and a temporary
disposable-PostgreSQL diagnostic for WR-03. The diagnostic was removed after
recording its result below. It did not create stored media or touch a personal
database. Runtime suites use the existing isolated runners and synthetic identities.

The image findings below carry forward the exact-artifact evidence in the
[production security review](PRODUCTION_SECURITY_REVIEW.md), from the same day and
unchanged deployment pins. Images were not rebuilt or rescanned in Task 23.1.
The workspace package audit was refreshed; its single High advisory remains open.
No live OAuth, vendor credentials, live server or personal collection was examined.

## Finding register

| ID    | Priority                 | Status                           | Finding                                                                                                          |
| ----- | ------------------------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| WR-01 | High                     | Carried; release blocker         | Public proxy retains critical/high dependency matches; runtime OS findings also need disposition.                |
| WR-02 | High                     | Carried; release assessment open | Garage's binary dependencies and source advisory matches have not been reconciled.                               |
| WR-03 | Medium                   | New; reproduced                  | Database public-asset eligibility expands shared dependency paths repeatedly and times out on an admitted graph. |
| WR-04 | Medium                   | New; source-confirmed            | Application failures and security-relevant outcomes lack the specified structured, redacted diagnostics.         |
| WR-05 | Medium                   | Carried                          | The privileged operations image retains a vulnerable globally bundled package manager.                           |
| WR-06 | Low application exposure | Carried; upstream High           | Prisma configuration tooling retains the recursive-object merge advisory.                                        |

**Critical:** none demonstrated. Upstream Critical scanner labels are preserved
in the security report; they are not automatically a demonstrated Critical
application exploit. **Low:** WR-06 remains a tracked, lower-exposure dependency
follow-up. Minor style preferences are excluded.

## WR-01 — Clear the public proxy and runtime artifact assessments

**Exact locations:** [production Compose](../../docker-compose.production.yml),
line 61, pins Caddy 2.11.7; [application Dockerfile](../../docker/app/Dockerfile),
lines 2–6 and 45–57, defines the Node/Debian runtime. Existing evidence and package
locations are in [PROD-09 and the image assessment](PRODUCTION_SECURITY_REVIEW.md#image-audit-and-remaining-release-work).

**Reason and consequence:** the reviewed Caddy image has three Critical and nine
High matches in its embedded Go/network/Brotli dependencies. It is the public
HTTPS boundary for both application and storage traffic. The web image also has
nine unresolved High Debian matches after available updates. These counts do not
prove exploitation of configured code paths, but a working browser flow is not
evidence of non-applicability. The existing release blocker remains unresolved;
the public proxy must not acquire approval merely because Task 23.1 completes.

**Recommended fix:** in Task 23.2, check supported vendor artifacts and pin a
patched build where available. Record an advisory-by-advisory applicability
assessment for retained findings, using the actual architecture, enabled modules
and package paths. Keep unfixed matches visible. Preserve the HTTPS-only storage
adapter, private ports, body/read budgets, trusted-header replacement and OAuth
log filtering. Do not silently substitute an unsupported proxy rebuild or claim
that an OS package with no published fix was patched.

**Acceptance:** scan the exact replacement artifact digests; record version,
advisory and applicability evidence; run the real production ingress and
backup/restore rehearsal. Unresolved public-ingress findings continue to block
release unless a substantiated disposition resolves their applicability.

## WR-02 — Establish the security state of the Garage binary

**Exact locations:** [production Compose](../../docker-compose.production.yml),
line 39, pins Garage v2.4.1; the
[source dependency cross-check](PRODUCTION_SECURITY_REVIEW.md#garage-source-dependency-cross-check)
records the incomplete binary inventory and source-lock results.

**Reason and consequence:** the image scanner recognized no packages in the
binary. The upstream lockfile check instead found 35 advisory matches across 19
crate names, including aliases, optional/build/test dependencies and maintenance
notices. Neither zero detected packages nor 35 raw matches establishes which
vulnerabilities affect the running storage service. Garage persists collection
media and exposes its authenticated S3 parser through the proxy; that unresolved
assessment matters even though bucket access and administrative ports are private.
No Garage exploit or collection-data loss was demonstrated.

**Recommended fix:** reconcile the pinned binary's compiled features/dependencies
with vendor release and advisory information, then use a supported patched
release/build or document specific non-applicability. An application lockfile
override cannot repair this Rust executable. Keep the three replicas, private
bucket/key and closed administrative ports. Treat a data-format upgrade as an
explicit storage operation with a matched, verified recovery path.

**Acceptance:** retain a feature-aware artifact inventory or equivalent vendor
evidence, disposition applicable advisories, and verify upload/completion,
authenticated streaming/ranges, withdrawal and encrypted restore using the
selected image. An empty scanner inventory cannot close this finding.

## WR-03 — Bound database lineage traversal by unique work

**Exact locations:** [asset migration](../../prisma/migrations/20261004170000_asset_upload_pipeline/migration.sql),
lines 338–343, defines `asset_public_eligible`; line 362 invokes it from
`guard_asset_use` whenever a public display pointer is set or retained.
[Application admission](../../src/server/services/public-collection/media.ts),
lines 84–122, uses visited/path sets and bounds unique nodes instead.

**Reason:** the SQL recursive CTE uses `UNION ALL` and emits a separate row for
every path to a shared source. Its depth cap does not cap the number of repeated
rows. A small acyclic graph with several shared inputs per layer can require
exponential work while satisfying the application's 128-node, depth-16 and
per-node-degree limits. This is distinct from the batched public read optimization
completed in Task 21.2: that loader is bounded, but the write-time database guard
still expands paths independently.

**Reproduction:** created 13 layers of four prepared IMAGE assets and one final
output, each non-leaf referencing all four assets in the preceding layer. Every
node was READY with approved rights; the output was a reviewed DISPLAY image.
Dependencies were inserted while each derived asset was PENDING, with its sources
already READY, so the existing lifecycle/lineage triggers remained enabled. This
is a synthetic relational fixture, not a claim that one-byte fixture images are
decodable stored media. Object bytes are irrelevant to the recursive SQL check.

| Observation                                            | Result                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------ |
| Unique assets / dependencies                           | 53 / 196                                                     |
| Maximum depth / immediate inputs                       | 13 / 4                                                       |
| Existing application `assetAdmission(tx)(id, "IMAGE")` | Admitted; approximately 134 ms                               |
| Existing `SELECT asset_public_eligible(id)`            | Cancelled at approximately 10,043 ms with PostgreSQL `57014` |
| SQL deadline                                           | Ten seconds, matching the current pool statement limit       |

The diagnostic transaction allowed fifteen seconds for transport/rollback, so
the observed error came from PostgreSQL's ten-second statement deadline. No
production limit was increased. A preliminary two-second diagnostic also timed
out; the final observation above uses the production statement budget.

**Consequence:** a permitted shared-source graph cannot reliably be approved or
updated through the database guard. The transaction rolls back safely; this is
an availability/curation failure rather than a rights bypass. The current upload
pipeline normally creates shallow resize families, and anonymous visitors cannot
create this graph through the reviewed endpoints. That bounds the finding to
Medium rather than a demonstrated anonymous denial of service.

**Recommended fix:** add a forward migration replacing the function with bounded
traversal that deduplicates shared work, preserves cycle/depth handling and fails
closed on invalid or excessive graphs. Align the database and service contracts;
do not merely raise the timeout, remove recursive rights checks, edit an already
committed migration or add a global eligibility cache.

**Acceptance:** retain a real PostgreSQL regression for this 53-node shared graph
and exercise an actual public-pointer approval/update, not just the standalone
function. It must complete within the existing budget. Cover revoked/missing
inputs, cycles, boundary/excessive depth and degree, unique-node limits, shared
ancestors and rollback. Re-run public-media, asset and storage suites.

## WR-04 — Add safe operational events before discarding error detail

**Exact locations:** [permission guard](../../src/server/auth/permissions.ts),
lines 36–54; [access revalidation](../../src/server/auth/access.ts), lines 68–90;
[asset service](../../src/server/services/assets.ts), lines 366–374;
[asset HTTP errors](../../src/server/http/assets.ts), lines 16–61;
[enrichment execution](../../src/server/services/enrichment/runs.ts), lines
140–165; [enrichment error mapping](../../src/server/services/enrichment/common.ts),
lines 61–68. Existing auth/database messages are at
[auth config](../../src/server/auth/config.ts), lines 100–108, and
[database client](../../src/server/db/client.ts), lines 25–26.

**Reason and consequence:** specification §129 requires structured events for
authentication/authorization failures, enrichment, uploads and server errors.
The reviewed application has only generic auth/pool console messages; routine
denials, upload outcomes and caught service failures do not produce such events.
Enrichment persists useful run status/failure codes, but that is not a replacement
for operational diagnostics across the application. A storage outage, permission
denial or database-trigger timeout can become a safe generic UI error with no
correlatable server event. This hampers recovery and abuse investigation, including
diagnosis of WR-03. The safe public error messages themselves are appropriate.

**Recommended fix:** introduce a small server-only structured-event boundary,
using built-in logging rather than another service or dependency. Emit an opaque
correlation ID, stable operation/outcome/error enums and only necessary opaque
resource/run/upload IDs. Log unexpected failures at the point where a controlled
classification can still be made; avoid duplicate events at every wrapper. Keep
the client response generic. Do not log raw error objects, request headers,
cookies, tokens, provider payloads, callback URLs, search text, filenames, private
notes/serials or environment values. Preserve Caddy's existing filtering.

**Acceptance:** meaningful tests cover denial, upload success/failure, enrichment
failure and an unexpected database/storage error. Capture emitted JSON and assert
useful classification/correlation plus absence of secret/private sentinels.
Verify that logging failure cannot prevent an authorized operation or change an
authorization decision. No external telemetry deployment is required.

## WR-05 — Update the privileged package-manager artifact coherently

**Exact locations:** [Dockerfile](../../docker/app/Dockerfile), lines 11–13 and
30–42; [package manager and engine pins](../../package.json), lines 6–10. See
[PROD-10 and operations-image evidence](PRODUCTION_SECURITY_REVIEW.md#image-audit-and-remaining-release-work).

**Reason and consequence:** pnpm 11.5.0 is installed globally in the operations
image, with its own bundled libraries. The earlier exact-image audit includes a
Critical tar advisory at
`/usr/local/lib/node_modules/pnpm/dist/node_modules/tar/package.json` and other
package-manager matches. Workspace dependency overrides do not change that tree.
The image performs privileged migrations/administration and handles configured
secrets. This is trusted operator/install exposure, not an application HTTP
handler, so the application priority is Medium despite higher upstream labels.

**Recommended fix:** check supported patched pnpm/parent releases and align the
project, build and operations pins, documented host prerequisites and frozen
lockfile. Rebuild and scan the actual operations image. Do not change the user's
global toolchain implicitly or force incompatible transitive majors.

**Acceptance:** install/build/typecheck/migrations and operator commands remain
compatible; the production/restore rehearsal passes; the new operations artifact
has a recorded advisory disposition. Keep package managers excluded from the
web runtime.

## WR-06 — Track the supported Prisma configuration dependency update

**Exact location:** [lockfile](../../pnpm-lock.yaml), lines 3284 and 6884,
retains `deepmerge-ts` 7.1.5 through Prisma configuration tooling. The fresh
workspace audit still reports one High upstream advisory in Prisma's
`deepmerge-ts` 7.1.5. The
[maintainer's advisory](https://github.com/RebeccaStevens/deepmerge-ts/security/advisories/GHSA-ggr8-5vv4-36mx)
requires recursive object graphs; ordinary JSON does not create that condition.
The observed use loads trusted Prisma configuration, and no attacker-controlled
runtime call was established. **Consequence:** an unsafe recursive configuration
merge can fail an operator command; a public application exploit is not established.
**Recommended fix and acceptance:** track a supported parent update with WR-05,
verify schema generation/migrations and rescan. This lower-exposure observation
does not justify forcing major 8 beneath Prisma or calling the package audit clean.
PostgreSQL/operations OS matches from Task 22.3 also retain their documented
package-path and reachability assessments.

## Reviewed boundaries retained

| Area                       | Assessment and evidence                                                                                                                                                                                                                                                                                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain and integrity       | Separate platform/model, game/release and accessory/variant roots; owned subtype constraints, restrictive canonical relationships, scoped credits/markets, append-only metadata history and same-template bindings are backed by schema/migrations and integration tests. No replacement entity hierarchy is justified.                                    |
| Transactions and authority | Current session/grant/role checks occur in underlying services. Mutations recheck after relevant catalog/location/copy locks, compare revisions and roll back atomically. The publication guard precedes domain locks; public reads use read-only repeatable snapshots. Last-administrator protection and fresh login remain in place.                     |
| Next.js and privacy        | Server-only feature/service entry points and server-rendered routes remain separate from client forms/viewers. Public data, metadata, counts/search/facets and contextual bytes have dedicated projections/gates. Logged-in public visitors do not gain private fields. No-store delivery and optimizer exclusions preserve subsequent-request withdrawal. |
| Uploads and storage        | Random locators, strict source/size/type checks, bounded image/GLB work, immutable prepared bytes/lineage, PENDING recovery and reference-aware deletion remain appropriate. External resources/decoder extensions are rejected by the interactive profile. Storage remains behind its neutral adapter. WR-02, WR-03 and WR-04 qualify this assessment.    |
| Enrichment and providers   | Optional IGDB/Wikidata calls use adapters, bounded responses/deadlines and fixed endpoints. Saved candidates, fenced runs, explicit relationship binding, revision checks, manual replacement acknowledgements and atomic provenance/receipts preserve reviewability. No LLM runtime or new provider is needed to complete this review.                    |
| Performance and 3D         | Search has bounded query deadlines and measured regression coverage; page hydration and copy choices are bounded. Renderer activation is deferred, with preflight budgets, abort/late-resource ownership, cleanup and static/reduced-motion fallbacks. WR-03 is a separate write-time SQL issue.                                                           |
| Operations and recovery    | Non-root/read-only web runtime, separate migration credentials, private service ports and retained volumes are deliberate. Encrypted matched backup/restore was rehearsed in Task 22.3. Off-host storage/key custody and real-host validation remain operator setup. Single-host Garage replicas do not constitute host-failure redundancy.                |

Existing intentional limits are not converted into new defects: owned component
presence/primary-package reconciliation remains inactive; templates describe
expected components and manual `hasBox` is retained. Public home/browse cards keep
neutral media stages, with approved images on details. Public external trailers,
arbitrary media importing, preview generation, multi-instance coordination,
workers and queues remain outside the implemented slice. Android testing remains
owner-waived; Safari native-memory limits and real-device/browser coverage remain
explicitly unverified rather than silently declared passing.

## Verification

Fresh verification on the unchanged application source:

| Check                                                             | Result                                                                                        |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Lint / typecheck                                                  | Passed                                                                                        |
| Unit/component suite                                              | 1,479 cases across 111 files passed                                                           |
| Full PostgreSQL integration suite                                 | 678 cases across 29 files passed, including the existing search-plan deadline regression      |
| Upload/processing/storage integration                             | All 45 asset-pipeline and 32 storage cases passed                                             |
| Backup helper tests                                               | Three cases passed                                                                            |
| Critical desktop/mobile browser selection                         | All 54 distinct cases passed across the initial run and final focused rerun                   |
| Production application build                                      | Passed through the browser runner                                                             |
| Renderer bundle ceiling                                           | Passed: 1,009,760 raw / 270,458 gzip bytes, below the unchanged limits                        |
| Schema / reference seeds                                          | Valid; four companies, five markets, 19 platforms and 35 models                               |
| Formatting / documentation links, anchors and fences / whitespace | Passed                                                                                        |
| Workspace dependency audit                                        | Nonpassing security audit: one High advisory, WR-06; not waived                               |
| WR-03 diagnostic                                                  | Reproduced PostgreSQL timeout; deliberately not represented as a fixed application regression |

Commands:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:assets
pnpm test:storage
pnpm test:backup
pnpm test:e2e:critical
pnpm test:e2e:access accessory-copies.spec.ts --project=chromium --grep '@critical editor creates'
pnpm db:validate
pnpm seed:validate
pnpm three:bundle
pnpm format:check
pnpm exec prettier --check --ignore-path /dev/null docs/architecture/WHOLE_REPOSITORY_REVIEW.md
pnpm audit --json
git diff --check
```

The first browser run had one fixture-process failure: a concurrently launched
asset check regenerated the shared ignored Prisma client while an accessory
fixture imported it, producing `Cannot find module './internal/prismaNamespace'`.
The browser scenario had completed its UI workflow and failed on a subsequent
fixture read. The identical desktop case then passed in a fresh serialized run
after every generating check had finished. All 54 distinct critical cases passed
across those runs; no test assertion, timeout, product behavior or runner policy
was changed.

The temporary WR-03 diagnostic ran separately against isolated PostgreSQL. Its
assertion confirms the timeout, so its passing diagnostic result does not clear
WR-03. No failing application regression was added to the repository. The real
production Docker/Caddy/Garage encrypted-restore rehearsal remains the earlier
Task 22.3 evidence; it was not repeated for this documentation-only change.
Live OAuth/provider consent, host configuration, off-host recovery and physical
device/native-memory limits remain outside this verification.

## Task 23.2 handoff

Apply WR-03 and WR-04, and resolve or explicitly substantiate the retained artifact
assessments WR-01, WR-02 and WR-05. Keep the lower-exposure Prisma/OS observations
visible, with supported-parent upgrades or documented reasons for retention.
Do not use a passing functional suite as a waiver for unresolved security findings.

Preserve the existing domain, manual-data, authorization, public-current-policy,
resource-budget and self-hosting contracts. A forward migration is expected for
WR-03. No new API server, queue, cache service, application feature or broad
architectural refactor is recommended. After remediation, run lint, types,
unit/integration tests and critical browser paths, plus relevant storage and real
production/restore checks for artifact changes. Report any finding left open and
why. Task 23.2 starts only when requested.
