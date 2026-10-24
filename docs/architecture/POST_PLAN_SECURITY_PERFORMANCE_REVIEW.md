# Post-plan security and performance review

Task 25.1 · 2026-10-23 · Starting commit `9d9261e`

The architecture remains appropriate for a shared physical collection running
on a single application instance. This review fixes a reproduced public-media
lookup problem, narrows unused public proxy surfaces and refreshes the supported
PostgreSQL image's security packages. It introduces no new dependency, schema,
migration, cache, service or frontend library.

**Production approval remains withheld.** The existing High proxy and storage
assessments remain open. Restricting request routes does not patch vendor
executables or establish that their other vulnerable code paths are unreachable.
See the [previous dispositions](FINAL_REVIEW_REMEDIATION.md) and the fresh
artifact evidence below.

## Scope

Reviewed the specification, completed plan and prior architecture/security and
performance reports against authentication, fresh grant/session authorization,
server actions and HTTP routes, upload/content validation, object transport,
public queries/media/SEO, catalog and copy writes, search/dashboard queries,
enrichment adapters and review/acceptance, 3D loading, deployment and encrypted
backup/recovery. Used the PostgreSQL best-practices skill for query/index and
transaction review; the architecture remains self-hosted PostgreSQL.

Source inspection and automated synthetic regression tests did not demonstrate
a new authorization bypass, private-field disclosure or catalog/copy corruption
in the reviewed paths. This is a scoped source and runtime review, not an
exhaustive penetration test, full vendor-binary audit or physical-device review.
No real OAuth provider, personal environment/data, live deployment, scheduled
backup or production volume was changed.

## Findings and fixes

| ID            | Priority                             | Disposition                                                                                                                                                        |
| ------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PP-01         | Medium                               | Fixed: a contextual byte request loaded up to 1,000 media associations per scope just to find one ID; a valid association beyond that window returned `NOT_FOUND`. |
| PP-02         | Medium hardening; WR-02 High remains | Fixed public-edge exposure: S3 bucket management and unused XML/object subresources reached Garage although the application needs only object transport.           |
| PP-03         | Low hardening; WR-01 High remains    | Fixed public-edge exposure: unused CONNECT/TRACE methods could enter the shared reverse-proxy handler.                                                             |
| PP-04         | Low deployment hardening             | Updated: PostgreSQL container packages had published Alpine/OpenSSL/musl/zlib and CA security updates.                                                             |
| WR-01 / WR-02 | High                                 | Retained: proxy/runtime native-package findings and incomplete Garage binary assessment.                                                                           |

### PP-01 — Resolve exactly one approved association

[The repository](../../src/server/repositories/public-collection/media.ts) now
queries the supplied association ID together with its exact item/catalog scope,
permitted role, approval and approval timestamp. Personal media still requires
the global disclosure setting and excludes serial photos. The result contains
only the display pointer and whether it is a model. The primary-key lookup needs
no additional index. The gallery query remains separately bounded.

[The delivery service](../../src/server/services/public-collection/media.ts)
continues to evaluate current policy, item publication, asset type/scope,
display/review requirements and the complete rights/dependency graph within one
read-only repeatable-read snapshot. It does not cache revocable eligibility or
extend a timeout. Originals and arbitrary asset IDs remain inaccessible.

The new [PostgreSQL regression](../../tests/integration/public-collection.test.ts)
creates 1,001 approved associations. It reproduces the last association's failure
against the original implementation, then verifies that first and last resolve
through the real service without calling the gallery loader. Existing tests
retain rights withdrawal, category/scope and concurrent-policy checks.

One local observation on the same synthetic snapshot is saved in
[the measurement JSON](../performance/POST_PLAN_MEDIA_EVIDENCE.json):

| Repository result             | Before        | After    |
| ----------------------------- | ------------- | -------- |
| Associations returned         | 1,000         | 1        |
| Serialized server-side result | 578,001 bytes | 77 bytes |
| Single observed lookup        | 83.62 ms      | 6.27 ms  |

The byte reduction is approximately 99.99% for this fixture. These are internal
repository results, not HTTP response sizes. The one-run local timings are
illustrative, not a production latency or capacity guarantee. Normal tests do
not rewrite evidence; explicitly use `PROJECT_REVIEW_EVIDENCE=1` with this
integration file to refresh it in disposable PostgreSQL.

### PP-02 — Limit the public storage edge to supported object operations

[Caddy routes](../../docker/proxy/routes.caddy) admit only GET, HEAD, PUT and
DELETE beneath `/<S3_BUCKET>/assets/`. Query strings must be empty or a single
exact SDK `x-id` for those operations. Bucket root/listing/control requests,
multipart uploads, tagging and extra/repeated/encoded query controls are rejected
with 404 before upstream dispatch. [Compose](../../docker-compose.production.yml)
passes the existing bucket setting to Caddy; no extra secret or setting is needed.

Signed Host, URI, payload, ranges and the existing body budgets remain unchanged.
The application already generates immutable UUID keys under that prefix and
uses these four object operations. Bucket/key/layout provisioning uses the
private Garage Admin API. This public hostname is deliberately unsuitable for
general S3 administration or a new multipart/signed-URL client without an
explicitly reviewed transport change.

This removes the public route to lifecycle XML parsing even with the app's valid
bucket-write key, narrowing a previously documented quick-xml exposure. The
private Docker S3 listener still contains that code, and the compiled Garage
dependency assessment remains unresolved. WR-02 is not closed.

### PP-03 — Reject unused proxy methods

The application ingress now returns 405 for CONNECT and TRACE before the reverse
proxy. Storage denies both through its method allowlist. This removes these
unused routes from the configured transport; it does not repair Go's other
HTTP/2 or TLS matches. Public HTTP/2 remains enabled and WR-01 remains open.

The new [isolated proxy suite](../../tests/operations/proxy.test.mjs), run with
`pnpm test:proxy`, exercises the real pinned Caddy image and production route
snippets. Denied requests fail against the original routes. Allowed requests
must dispatch to closed test upstreams; actual signed byte/range transport is
separately exercised in the full production rehearsal. It creates no production
volume and uses random loopback ports. The production runner also sends benign,
correctly signed lifecycle/tagging requests and requires rejection while normal
put/stat/ranged-get/remove operations succeed before and after recreation.

### PP-04 — Refresh published PostgreSQL image security packages

The production/development Compose files and isolated PostgreSQL runner now use
the current official image index
`sha256:f4610795587492cd4fb887c2dc3de301b813278bb6f616992061141b5f15ac36`,
replacing `sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685`.
Both actual executables report PostgreSQL 16.15. This is a vendor package refresh
within the same database release; it does not change schemas, role privileges,
storage format or volume names. No personal database was restarted or migrated.

Direct package inspection confirms these changes:

| Component             | Original image | Updated image |
| --------------------- | -------------- | ------------- |
| Alpine                | 3.24.1         | 3.24.3        |
| libcrypto3 / libssl3  | 3.5.7-r0       | 3.5.9-r0      |
| musl                  | 1.2.6-r2       | 1.2.6-r3      |
| zlib                  | 1.3.2-r0       | 1.3.2-r1      |
| CA certificate bundle | 20260611-r0    | 20261020-r0   |

The [Alpine security release](https://www.alpinelinux.org/posts/Alpine-3.21.9-3.22.7-3.23.7-3.24.3-released.html)
documents fixes for musl, zlib, OpenSSL and the CA bundle. The
[OpenSSL release notes](https://www.openssl-library.org/news/openssl-3.5-notes/index.html)
identify 3.5.8 and 3.5.9 as security patches. We verified actual installed packages
instead of inferring a security update from a changed tag digest alone.

Both complete scanner reports still return the same advisory set, including
four Critical / 31 High matches in startup-only gosu's Go library and libxml2.
The vendor's newer package fixes were absent from those scanner results. This
is an inventory/advisory coverage limit, not proof that the superseded packages
were current. The update applies published fixes without claiming a new exploit
against the configured PostgreSQL service or clearing the retained findings.
Use the normal reviewed backup/update procedure for existing installations;
older matched backups retain their original image references.

## Artifact assessment

The workspace package audit reports zero known vulnerabilities. This covers the
project dependency graph, not container OS tools or embedded Rust/Go libraries.

The official [Caddy releases](https://github.com/caddyserver/caddy/releases) and
[Garage release feed](https://garagehq.deuxfleurs.fr/_releases.html), plus their
current tag manifests, still resolve to the already pinned stable artifacts:

- Caddy 2.11.7, index `sha256:eb4d35b7452d1ab6171fbdbe8d9275b2301dad6dad92115d91e19fb9b24d510f`.
  A fresh Critical/High Docker Scout scan retains three Critical and nine High
  distinct advisory IDs, represented by 17 package/advisory pairs. PP-03 narrows
  configured CONNECT exposure; the other advisory dispositions in the previous
  report remain applicable and open.
- Garage v2.4.1, index `sha256:9c96caa2612d3411acc5b0e6701fb238dbfba33e533a6d7d3d811a4b12d0d020`.
  The incomplete binary inventory and retained source/feature assessment still
  require vendor evidence or a supported patched artifact. PP-02 narrows public
  XML exposure without claiming executable-wide clearance.

Final rebuilt local image identities (Linux amd64), scanned with Docker Scout
1.26.0 on 2026-10-23:

- Web: `sha256:00bdbe6f5bf8511afa5f704e695b8e19ce7acf75778cbdb5f43afe8211583ea5`.
  Zero Critical / nine High matches across four Debian packages, with the same
  advisory IDs and applicability assessments as the previous remediation.
- Operations: `sha256:8e0b9037779c1a866f3902520bd92ee48f81801e61b63bb659ccf13b2daa8fef`.
  Zero Critical / nine High matches across the same four Debian packages.
  The global operator-tool tree has no retained Critical/High match in this scan.
- PostgreSQL: the new pinned official image is scanned and directly inspected as
  described in PP-04. The gosu/libxml2 findings remain visible; vendor-verified
  native security updates do not imply a zero-finding artifact.

The final production rehearsal passes signed object transport and denied
management requests, runtime role/port/isolation checks, all ten distinct browser
cases and encrypted restoration on the refreshed PostgreSQL image. The two
restore-only cases are intentionally unselected in the eight-case initial phase
and then pass in the separate restore phase. No test is skipped to clear a failure.

## Verification

| Check                                                            | Result                                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Unit/component                                                   | 1,485 passed                                                             |
| Complete PostgreSQL integration                                  | 691 passed across 31 files on the refreshed image                        |
| Asset upload pipeline                                            | 46 passed on the refreshed image                                         |
| Storage transport                                                | 32 passed                                                                |
| Proxy method/path/query regressions                              | 21 reported tests passed (20 subchecks plus parent)                      |
| Backup tooling                                                   | 3 passed                                                                 |
| Critical desktop/mobile browser journeys                         | 54 passed                                                                |
| Real production HTTPS / encrypted fresh-volume restore           | 10 distinct browser cases passed, signed transport/control checks passed |
| Lint / types / schema / seeds / formatting / local documentation | Passed                                                                   |
| Workspace package audit                                          | Zero known vulnerabilities                                               |

The fresh application build's deferred 3D bundle also passes its existing
budget: 1,009,761 raw / 270,459 gzip bytes, below the 1,310,720 / 327,680 limits.

The new regressions were also checked against the original implementation.
Production ingress and restore pass before and after the PostgreSQL package
refresh. The final complete database and upload suites pass on the new image.

The refreshed-image integration run exposed a
[raw persistence test](../../tests/integration/search.test.ts) that omitted
the production service's existing `configureSearch(tx)` call and timed out under
the default ten-second database budget. The test now uses the same transaction
settings as both real service callers, including JIT off and the stricter
two-second statement limit. Its narrow-column, hierarchy and result assertions
are unchanged. This is a fixture correction, not a raised deadline or a search
behavior change; the final complete suite passes after it. The existing pg
adapter deprecation remains visible and nonfailing; no warning filter was added.

## Further improvements

These are recommendations for separately scoped follow-ups, not new features
silently included in this change:

- Add automated pull-request gates for lint/types/unit/integration and critical
  browser paths, with a separate exact-image advisory gate. Keep functional
  success and unresolved vendor findings distinct. Cross-check vendor security
  releases for fixes absent from scanner reports.
- Collect deployed latency/query measurements for large galleries and shared
  asset graphs before selecting further indexes or caching. Revocable media
  authorization must remain current; cached public approval is inappropriate.
- Finish the existing operator checks: real-provider OAuth, physical mobile
  Safari/camera/accessibility behavior, host firewall/certificate renewal,
  scheduled backup execution and an off-host restore. Local emulation and
  matched-volume restore do not establish these external properties.

No further architectural redesign is justified by the evidence from this pass.
