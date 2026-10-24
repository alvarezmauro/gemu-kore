# Final review remediation

Task 23.2 · 2026-10-23 · Applies the [whole repository review](WHOLE_REPOSITORY_REVIEW.md).

**Production approval remains withheld.** Application remediations are implemented;
public proxy and storage vendor findings remain open. Local functional tests do
not establish that those binaries are free of vulnerabilities. No live deployment
or personal collection data was changed.

## Disposition

| Finding                             | Disposition                                                                                                                                                                                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WR-01 High                          | Supported Caddy release and exact image rechecked; remaining public HTTP/2 and other artifact findings retained below. No unsupported binary rebuild substituted.                                                                             |
| WR-02 High                          | Pinned Garage binary features reconciled with the vendor build definition and source call sites. This narrows exposure but cannot close the complete executable assessment. No newer supported release was available.                         |
| WR-03 Medium                        | New forward migration bounds database eligibility by unique nodes and longest path. Application admission now measures shared subtree depth consistently.                                                                                     |
| WR-04 Medium                        | Server-only, allowlisted JSON events cover authentication/authorization failures, upload lifecycle, enrichment execution and unexpected database failures.                                                                                    |
| WR-05 Medium                        | Project and container pnpm pins updated from 11.5.0 to 11.28.8; frozen dependency installation and rebuilt operator image checked separately from the workspace audit. Unused inherited npm/npx/Yarn tools removed from the operations image. |
| WR-06 lower exposure, upstream High | Prisma/client/PostgreSQL adapter updated together to supported 7.10.1. Its configuration package uses deepmerge-ts 8.0.2 without a forced transitive major override.                                                                          |

## Supported dependency patches

Prisma, its client and PostgreSQL adapter move together from 7.10.0 to 7.10.1;
Prisma 8 remains a release candidate and was not adopted. pnpm moves from 11.5.0
to 11.28.8 in packageManager/engines and both Dockerfiles. Project commands use
the pinned managed pnpm version; the machine-wide installation was not changed.

The refreshed audit also identified the
[Zod constrained-collection advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
and [body-parser compressed-body advisory](https://github.com/advisories/GHSA-27r3-jxmh-p828).
Zod is 4.6.7, shadcn 4.22.1 supplies a supported Zod-4 dependency path, and
body-parser is 2.4.0 within its consumers' major-2 ranges. Compatible overrides
also patch undici 7/8 to 7.30.1/8.12.2 and fast-uri 3 to 3.1.9 for the newly
reported EventSource/SRI/URI issues. The optional MySQL adapter pin is aligned to
3.24.6, satisfying the updated Prisma tooling's dependency range; application
connections still use PostgreSQL only. No consumer is forced onto a different
major version. The final frozen-lockfile workspace audit reports zero known
vulnerabilities; this does not inventory global container tools or Rust/Go binaries.

## Bounded public asset eligibility

Migration `20261023000000_bounded_asset_eligibility` replaces only the existing
`asset_public_eligible(uuid)` function. It discovers each unique source once,
retains a bounded adjacency graph and resolves subtree heights from leaves.
The existing limits remain 128 unique assets, 128 inputs per node and depth 16.
Missing/unready/unapproved sources, unsupported dependency purposes, cycles and
excessive graphs fail closed. Root display/review/public-safety requirements
remain unchanged. Rights are evaluated in the current transaction snapshot;
there is no persistent eligibility cache or longer database timeout.

The reproduced 53-node, 196-edge shared-source graph now passes the real service
approval and pointer-retaining database guard under a two-second test statement
budget. Tests cover rights withdrawal and rollback, depth 16/17, the unique-node
boundary, missing assets and corrupt cyclic data. Application admission memoizes
subtree heights so a previously visited shared source cannot hide a later path
that exceeds the depth limit. Existing immutable migrations were not edited.

Apply the new migration through the usual reviewed deployment command before
running the updated application; see [database operations](../operations/DATABASE.md).
Only disposable test databases were migrated during this task.

## Operational diagnostics

`src/server/observability/events.ts` emits one JSON object per event to standard
output (started/succeeded) or standard error (failed/denied). Each object has a
UTC timestamp, server-generated correlation UUID, fixed operation and outcome,
and an optional allowlisted code. Optional details are UUID-only upload/run
identifiers and an enumerated permission. Async context correlates nested work;
propagated errors and duplicate authentication SDK callbacks are deduplicated
within that context. Independently invoked work receives a new context.

The logger never serializes error messages, stacks, causes, SQL, headers, cookies,
OAuth state/tokens, URLs, filenames, object keys, collection names/notes, provider
queries/payloads or supplied correlation IDs. No arbitrary property bag is
accepted. Logging failures are swallowed without changing authorization,
transaction rollback, upload responses or enrichment outcomes. Upload success is
emitted after the operation succeeds; enrichment success follows the committed,
generation-fenced result. Normal media reads and successful permission checks do
not produce an access log. These are operational events, not a durable actor audit
ledger. Keep container logs private and apply host-side retention/rotation.

## Retained Caddy assessment — WR-01

The [official releases](https://github.com/caddyserver/caddy/releases) still list
2.11.7 as the latest stable release. The selected reference remains
`caddy:2.11.7-alpine@sha256:eb4d35b7452d1ab6171fbdbe8d9275b2301dad6dad92115d91e19fb9b24d510f`.
Its actual `build-info` reports Go 1.26.8 and golang.org/x/net 0.59.0.
The fresh scan reports 17 package/advisory pairs across 12 distinct advisory IDs.
The scanner's Go/network fix direction remains Go 1.26.9 / x/net 0.60.0.
The following assessments use the configured reverse proxy and primary Go
vulnerability records; a narrowed condition does not patch the executable.

| Match                                                  | Configured exposure and disposition                                                                                                                                                                                                                         |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [CVE-2026-78659](https://pkg.go.dev/vuln/GO-2026-6603) | HTTP/2 Trailer-map memory amplification. Public HTTP/2 is enabled; header/body budgets do not prove the internal allocation is bounded. Open release blocker.                                                                                               |
| [CVE-2026-78669](https://pkg.go.dev/vuln/GO-2026-6611) | HTTP/2 initial-window SETTINGS CPU amplification. Public protocol path is enabled. Open release blocker.                                                                                                                                                    |
| [CVE-2026-78663](https://pkg.go.dev/vuln/GO-2026-6612) | HTTP/2 server flow-control refund issue. Public protocol path is enabled. Open release blocker.                                                                                                                                                             |
| [CVE-2026-97032](https://pkg.go.dev/vuln/GO-2026-6617) | HTTP/2 HPACK concurrent-encoder crash. Public protocol path is enabled. Open release blocker.                                                                                                                                                               |
| [CVE-2026-56866](https://pkg.go.dev/vuln/GO-2026-6605) | CONNECT-with-body transport desynchronization. The routes have no tunnel feature, but this alone does not prove CONNECT cannot reach the shared reverse-proxy transport. Remains open.                                                                      |
| [CVE-2026-94439](https://pkg.go.dev/vuln/GO-2026-6613) | HTTP/1 CONNECT 2xx without hijacking. No intentional successful CONNECT handler is configured; hostile-method behavior requires separate verification. Retained.                                                                                            |
| [CVE-2026-78660](https://pkg.go.dev/vuln/GO-2026-6610) | Malformed framing in HTTP/2 upstream responses. App/Garage upstreams use cleartext HTTP/1; ACME and other compiled clients still require assessment. Narrowed, retained.                                                                                    |
| [CVE-2026-97031](https://pkg.go.dev/vuln/GO-2026-6607) | TLS ECH outer-extension amplification. No ECH keys are configured; actual affected TLS entry points still need vendor reachability evidence. Retained.                                                                                                      |
| [CVE-2026-94440](https://pkg.go.dev/vuln/GO-2026-6608) | Go MIME/multipart parser allocation. These routes stream bodies to Next/Garage, with no configured Go form parser. No demonstrated route to this function; retain the binary match pending module-level confirmation.                                       |
| [CVE-2026-78667](https://pkg.go.dev/vuln/GO-2026-6609) | Go static file Range parser. No Caddy file_server route is configured; forwarded application ranges use the existing single-range validation. No demonstrated Go static-serving path; retained package match.                                               |
| [CVE-2026-56857](https://pkg.go.dev/vuln/GO-2026-6604) | Windows-only Root.Mkdir junction escape. Not applicable to the selected Linux container; recorded as an artifact match, not patched.                                                                                                                        |
| CVE-2026-111497                                        | Alpine brotli-libs 1.2.0-r0; scanner fix 1.2.1-r0. Actual build-info has CGO_ENABLED=0 and ldd confirms Caddy is not dynamically linked, excluding this native library from its parser path. Native package finding remains for the base image/other tools. |

Disabling HTTP/2 would change supported transport behavior and would not resolve
all retained matches. No such workaround or custom Go rebuild was silently added.
No malicious protocol payload or proof-of-exploit was executed.

## Retained Debian package assessment — WR-01

The runtime package versions remain util-linux 2.38.1-5+deb12u3, perl-base
5.36.0-7+deb12u4, OpenSSL 3.0.22-1~deb12u1 and zlib 1:1.2.13.dfsg-1.
The fresh scanner lists no fixed Bookworm versions for these nine matches.
These assessments use the scanner descriptions and actual container restrictions;
no malicious native payload was executed. They identify configured exposure,
not proof that a package's vulnerable code has been removed.

| Retained match | Configured exposure and disposition                                                                                                                                                                                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CVE-2026-53613 | Restricted mount/fstab validation. The web server has no mount workflow, host fstab/device mount, capabilities or privilege escalation. No application path demonstrated; retained vendor package finding.                                                                                     |
| CVE-2026-78409 | X-mount.subdir detached-tree/symlink condition. No mount-option input or mount command is exposed by the application; same container restrictions. Retained vendor finding.                                                                                                                    |
| CVE-2026-78410 | Restricted bind mount source race. No bind-mount action is available inside the server and the process cannot gain privileges. Retained vendor finding.                                                                                                                                        |
| CVE-2026-78408 | nsenter --join-cgroup privileged descriptor retention. The application never invokes nsenter or changes namespaces/cgroups. Retained vendor finding.                                                                                                                                           |
| CVE-2026-76642 | Privileged mount helper/hooks. No mount helper or hook workflow is configured; same restrictions. Retained vendor finding.                                                                                                                                                                     |
| CVE-2026-53615 | libblkid extended DOS partition parser. The application accepts image/GLB media, not block devices or filesystem images, and invokes no partition probe. No demonstrated application input path; retained vendor finding.                                                                      |
| CVE-2026-82560 | Perl Pod::Text formatting exhaustion. No user-supplied POD formatter or Perl command is part of request handling. Retained vendor finding.                                                                                                                                                     |
| CVE-2026-84782 | OpenSSL DTLS retransmission. Application/storage connections use HTTPS/TLS, with no DTLS listener or datagram TLS consumer configured. Native package match retained for vendor disposition.                                                                                                   |
| CVE-2026-85091 | zlib nonblocking gzwrite condition. No such file-writing API is exposed by the application. The scanner's upstream affected-version description differs from the installed Debian version; retain pending distribution-specific confirmation rather than clearing by version comparison alone. |

Do not hand-replace distribution libraries or remove system packages without
checking runtime/linkage requirements. The non-root/read-only/capability limits
are supporting exposure evidence, not a blanket exemption for native libraries.
The PostgreSQL startup-helper/libxml2 findings from the prior review also remain
tracked there; the database major version and initializer were not replaced.

## Retained Garage assessment — WR-02

The [official release feed](https://garagehq.deuxfleurs.fr/_releases.html) was
retrieved successfully: latest stable is v2.4.1 (2026-09-08). The selected reference
remains `dxflrs/garage:v2.4.1@sha256:9c96caa2612d3411acc5b0e6701fb238dbfba33e533a6d7d3d811a4b12d0d020`.
Actual `garage --version` reports these compiled features: bundled-libs,
consul-discovery, fjall, journald, k2v, kubernetes-discovery, lmdb, metrics, sqlite,
syslog and telemetry-otlp. They match the vendor's
[v2.4.1 release build definition](https://github.com/deuxfleurs-org/garage/blob/v2.4.1/nix/compile.nix).
The deployed config selects LMDB and S3, not discovery, telemetry or K2V listeners.
Compiled feature presence and configured service use are distinct.

The 35 source-lock advisory matches across 19 crate names from the earlier
[security review](PRODUCTION_SECURITY_REVIEW.md#garage-source-dependency-cross-check)
are reconciled as follows. Aliases remain one issue, maintenance notices remain
maintenance notices, and no zero-package scanner result is treated as a clean bill.

| Source advisory group                                                                  | Evidence and disposition                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| quick-xml 0.39.2, RUSTSEC-2026-0194/0195                                               | S3 lifecycle/CORS/website handlers call quick_xml::de::from_reader. Router owner permission protects CORS/website, but lifecycle uses bucket write permission, which the app key has. XML parser exposure is authenticated, not absent. Exact duplicate-attribute/NsReader reachability and vendor fix remain open.                |
| h2 0.3.27/0.4.13, RUSTSEC-2026-0258                                                    | S3 Cargo features enable hyper server/http1, and Caddy uses HTTP/1 upstream. Optional discovery/telemetry clients are compiled but not configured. Narrowed; not a complete binary clearance.                                                                                                                                      |
| rustls 0.21.12/0.23.39, RUSTSEC-2026-0285/0346/0348/0349                               | Public TLS terminates in Caddy; Garage's configured internal S3/RPC listeners do not provide public rustls termination. Compiled outbound integration clients still require dependency/feature reachability confirmation. Debug-secret, compression and handshake conditions are retained, not dismissed by ingress TLS placement. |
| rustls-webpki/webpki-root-certs, RUSTSEC-2026-0098/0099/0104/0382/0383                 | Certificate-chain, CRL and distrust conditions apply to compiled TLS consumers; configured optional consumers are absent. Narrowed, pending vendor feature-level inventory and applicable fixes.                                                                                                                                   |
| anyhow/crossbeam-epoch/event-listener/lru/tokio, RUSTSEC-2026-0190/0204/0221/0253/0386 | Foundational runtime/soundness issues cannot be cleared by private admin ports. No matching unsafe API misuse demonstrated in inspected application-facing source; retain until vendor update or call-site proof.                                                                                                                  |
| ctutils/cmov, RUSTSEC-2026-0385 / GHSA-3rjw-m598-pq24                                  | Constant-time and architecture-specific correctness conditions remain relevant to crypto dependencies. No vendor artifact proof of absence; retained.                                                                                                                                                                              |
| xxhash-rust, GHSA-6g2r-675j-hx59                                                       | Inspected data helper uses Xxh3 in its test module, with no demonstrated short custom-secret input path. Narrowed, not an executable-wide guarantee.                                                                                                                                                                               |
| aws-smithy-json, GHSA-8ffr-xgwf-xj56                                                   | Advisory concerns generated Smithy server unknown-key parsing. Garage's S3 implementation is its own hyper/XML server; no such generated server path demonstrated. Keep source match separate from runtime exploit claims.                                                                                                         |
| protobuf 2.28.0, RUSTSEC-2024-0437 / GHSA-2gh3-rmm4-6rq5                               | Metrics/telemetry support is compiled; endpoints/integrations are private or unconfigured. No untrusted recursive protobuf ingress established; retained pending binary inventory.                                                                                                                                                 |
| paste/proc-macro-error/structopt/unsafe-libyaml maintenance notices                    | Vendor maintenance follow-up; do not count these notices as demonstrated independent runtime exploits.                                                                                                                                                                                                                             |

Source references: [S3 dependencies](https://github.com/deuxfleurs-org/garage/blob/v2.4.1/src/api/s3/Cargo.toml),
[lifecycle parser](https://github.com/deuxfleurs-org/garage/blob/v2.4.1/src/api/s3/lifecycle.rs),
[permission router](https://github.com/deuxfleurs-org/garage/blob/v2.4.1/src/api/s3/router.rs).
A feature listing is not a full binary SBOM and does not establish absence of
unsafe downstream call paths. WR-02 remains open. An application pnpm override
cannot repair this Rust executable. No storage-format migration, custom Rust build,
backend replacement or change to replicas/bucket permissions was made.

## Exact artifact evidence

Rebuilt local image index digests (tested platform: Linux amd64), scanned with
Docker Scout 1.26.0 on 2026-10-23:

- Web: `sha256:04030c2a77c8f36a42c3c3df35d9408e9e2e4334d8212153212d81388b1a8465`.
  Zero Critical / nine High Debian advisory IDs across four packages; unchanged
  from the retained package set above. No package-manager tree exists in this
  exposed image.
- Operations: `sha256:d2e405c5acbc0a353b3e93197f6a0bb0c478a67ed152009de9fa999888f6858e`.
  Final scan: zero Critical / nine High Debian matches across the same four
  packages as the web image; no remaining Critical/High npm/pnpm tree matches.
  The first rebuild retained five High matches in unused inherited npm packages
  (brace-expansion 5.0.9, undici 6.28.0 and http-cache-semantics 4.2.0), at
  `/usr/local/lib/node_modules/npm/node_modules/`. They were removed with npm,
  npx and Yarn; all operator commands use pinned pnpm/Node. The production
  runner now verifies their absence and the global pnpm pin in the actual image.
  Direct package inspection confirms global pnpm 11.28.8, tar 7.5.22 and undici
  6.29.1; brace-expansion/http-cache-semantics no longer exist at their prior
  bundled paths. This inventories the operator tool separately from the workspace.
- Caddy's unchanged pinned digest was rescanned: three Critical / nine High
  distinct advisory IDs, with 17 package/advisory pairs because Go and x/net
  share several IDs. Linux/CGO applicability is assessed above.
- Garage's unchanged pinned executable was interrogated for its real compiled
  features and reconciled against vendor source; no complete binary dependency
  inventory or vulnerability clearance is claimed.

## Verification and remaining work

Verification performed for the remediation:

| Check                                                    | Result                                                                           |
| -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Unit/component                                           | 1,485 passed                                                                     |
| Complete PostgreSQL integration                          | 690 passed across 31 files                                                       |
| Asset upload pipeline                                    | 46 passed                                                                        |
| Storage                                                  | 32 passed                                                                        |
| Backup tooling                                           | 3 passed                                                                         |
| Critical desktop/mobile browser paths                    | 54 distinct cases passed across the initial run and focused rerun                |
| Real production HTTPS / encrypted restore                | 10 distinct browser cases passed on both the first and trimmed-operations builds |
| Lint / types / schema / formatting / documentation links | Passed                                                                           |
| Workspace package audit                                  | Zero known vulnerabilities                                                       |

The initial critical run passed 50 cases; four enrichment cases failed because
new operational events shared stdout with the fixture CLI's JSON result. The
isolated helper now reserves stdout for its result and sends diagnostics to
stderr. Six focused desktop/mobile cases pass after that fix, covering all four
affected enrichment cases and both stale-copy flows. No failed case is waived.

Browser review also identified the existing COPY_STALE domain error missing
from the operational allowlist. It is now recognized, avoiding a false unexpected
transaction fault while preserving rollback and the original UI outcome. Five
focused unit and three real-transaction tests pass after that refinement, followed
by type/lint checks and the fresh production build used by the focused browser run.
The exact container snapshots above capture the dependency/tool fixes and restore
rehearsals; these final diagnostic/test-protocol refinements were checked through
that fresh application build and focused regressions, without changing the
scanned dependency inventory. The historical reports retain their original counts.

The production runner first runs eight ingress/media/security cases, then two
restore-only cases against fresh restored volumes. The two restore cases are
intentionally deferred in the initial run, not omitted from verification.
The second rehearsal includes the trimmed operations image's tool-boundary and
pnpm-version assertions. It confirms retained-volume recreation, database hashes,
every READY asset's bytes and browser access to restored private photo/GLB bytes.
No live OAuth/certificates, malicious vendor protocol payloads or personal data
were used.

Reproduce through the existing commands, running client generation/build/browser
steps sequentially so parallel runners do not overwrite generated Prisma or Next
outputs:

```sh
pnpm lint
pnpm typecheck
pnpm test --maxWorkers=2
pnpm test:integration
pnpm test:assets
pnpm test:storage
pnpm test:backup
pnpm test:e2e:critical
pnpm test:production
pnpm db:validate
pnpm format:check
pnpm audit --json
```

Scan each exact built/pinned image with
`docker scout cves --format sarif --only-severity critical,high local://IMAGE`;
the successful scanner command does not mean its vulnerability count is zero.
Historical reviews preserve their original baseline counts.

Intentionally unchanged: Caddy/Garage vendor binaries and the retained native
package matches above, because supported patched artifacts or complete
non-applicability evidence were unavailable. Custom compiler builds, storage-format
upgrades, transport workarounds, backend replacements and live deployment are not
silently substituted. Release approval still requires resolving WR-01/WR-02,
refreshing exact artifacts and repeating relevant ingress/recovery checks. The
machine-wide Node/pnpm installations and personal development volumes were not
modified.
