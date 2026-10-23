# Production security review

Task 22.3 · Reviewed 2026-10-23 · Repository and disposable Docker deployment

The review covers Docker, secrets, uploads, authentication, OAuth, PostgreSQL,
object storage, the reverse proxy, browser headers and public endpoints. It finds
no demonstrated authorization bypass or private-data disclosure through the
reviewed application routes. It does find production dependency, ingress and
logging issues, addressed below. This is a source review with local integration
evidence, not a certification of an uninspected live server or a clean image audit.
**Production sign-off remains blocked by unresolved proxy image advisories.**
Storage dependencies and operator tooling also retain the open assessments below.

## Boundaries and method

Reviewed the specification, production/backup guides, Compose topology, Dockerfile,
provisioning, migrations/roles, auth/provider adapters, API handlers, Server Action
entry points, upload processing, storage adapter, public query/media policies and
existing adversarial tests. Browser inputs, IDs, serialized roles, forwarding
headers and provider metadata remain untrusted. Server configuration, the Docker
operator and offline recovery key are separate trusted administrative powers.

No personal environment files, production credentials or live collection data were
used. All HTTP, database, upload and recovery exercises use uniquely named disposable
resources. Dependency advisories were checked against their published descriptions;
image package detection is distinguished from an exploitable application path.

## Findings and disposition

| ID      | Application priority                                 | Location                                                                                                                                | Finding and disposition                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PROD-01 | High                                                 | [package.json](../../package.json), [lockfile](../../pnpm-lock.yaml)                                                                    | Next.js 16.3.8 matches a Server Actions denial-of-service advisory applicable to this application. Updated Next.js, its environment package and lint configuration to 16.4.1.                                                                                                                                                                                                                                                                           |
| PROD-02 | High                                                 | [production Compose](../../docker-compose.production.yml), [Dockerfile](../../docker/app/Dockerfile)                                    | Old pinned image contents include vulnerable proxy/OS/tool dependencies. Updated Caddy to 2.11.7 and Node to 24.22.1 with new digest pins, applied available Debian updates, and removed npm/npx/Yarn from the web runtime. Remaining scanner findings require the reachability assessment below.                                                                                                                                                       |
| PROD-03 | Medium                                               | [auth configuration](../../src/server/auth/config.ts), [environment parsing](../../src/server/config/auth-env.ts)                       | All sign-in clients previously shared the SDK's no-trusted-IP bucket, allowing one client to consume another's allowance. Added explicit opt-in to Caddy's overwritten `X-Real-IP`, with a ten-attempt/minute social sign-in rule. Other deployments default to trusting no forwarding headers.                                                                                                                                                         |
| PROD-04 | Medium                                               | [Caddy global configuration](../../docker/proxy/Caddyfile)                                                                              | Proxy failures could log the original callback URI, including OAuth code/state, despite application redirect sanitization. Default structured logs now remove request URI/headers and response headers. Access logging remains disabled.                                                                                                                                                                                                                |
| PROD-05 | Medium                                               | [Caddy routes](../../docker/proxy/routes.caddy), [global timeouts](../../docker/proxy/Caddyfile)                                        | The outer ingress lacked explicit request body/read budgets. Added 1-MiB ordinary-body, 50-MiB upload-body and 64-MiB S3 transport limits, plus header/body/idle timeouts. Application validation retains its narrower image/template limits.                                                                                                                                                                                                           |
| PROD-06 | Low, defense in depth                                | [Next.js configuration](../../next.config.ts), [Caddy routes](../../docker/proxy/routes.caddy)                                          | Browser protections previously varied by route. Added global MIME-sniffing, framing, referrer, restricted browser-feature and baseline CSP headers, disabled the framework banner, and added one-year HSTS at HTTPS ingress.                                                                                                                                                                                                                            |
| PROD-07 | Low application exposure; higher upstream severity   | [dependency overrides](../../pnpm-workspace.yaml)                                                                                       | Updated Vite to 8.3.3, the shadcn CLI's MCP SDK to 1.32.0 and its IP parser to 10.7.4. These tooling advisories did not establish a public application exploit. No new package or provider was added.                                                                                                                                                                                                                                                   |
| PROD-08 | Open, high upstream; trusted-tooling exposure        | Prisma's transitive `deepmerge-ts` 7.1.5                                                                                                | Recursive object-graph merging can exhaust the stack. The identified path loads trusted Prisma configuration, not browser JSON or provider metadata. Do not force its major-8 replacement underneath Prisma; update through a supported parent release and rescan.                                                                                                                                                                                      |
| PROD-09 | Open release blocker; critical/high upstream matches | Caddy 2.11.7's embedded Go 1.26.8 / `x/net` 0.59.0 and Alpine Brotli                                                                    | The latest published stable proxy image still has twelve critical/high matches. Do not approve this internet-facing image until a supported patched rebuild is verified, or a documented per-advisory non-applicability assessment establishes an acceptable deployment. A successful browser test cannot resolve this finding.                                                                                                                         |
| PROD-10 | Open, high/critical upstream; operator tooling       | [package-manager pin](../../package.json), [operations image](../../docker/app/Dockerfile)                                              | Project/operations pnpm 11.5.0 and its bundled archive/network libraries retain advisories, including a critical tar match. These are trusted install/operator commands, not HTTP handlers. Align and verify a supported patched pnpm toolchain (scanner fixes extend through 11.11.0), regenerate the frozen lockfile and rebuild operations before processing untrusted workspaces/archives. Workspace overrides do not patch a globally bundled CLI. |
| PROD-11 | Open, storage dependency assessment                  | [Garage pin](../../docker-compose.production.yml), [upstream lockfile](https://github.com/deuxfleurs-org/garage/blob/v2.4.1/Cargo.lock) | An empty image inventory cannot clear the Rust binary. Source-lock queries return 35 advisory matches, including aliases, optional/test dependencies and maintenance notices. Verify compiled features/reachability and a vendor-supported patched release/build before clearing storage. Do not replace Rust libraries inside this application or assume a live-volume upgrade is interchangeable with cold recovery.                                  |

### Runtime dependencies

The [Server Actions advisory](https://github.com/advisories/GHSA-p3m5-59mp-jv5r)
affects an App Router application with at least one Server Action, which this
repository has. Updating to its published fixed version is necessary even though
the application's own actions authorize and validate their inputs: framework
request parsing happens before those service checks.

Two other Next.js advisories have upstream critical severity. The
[image-optimization issue](https://github.com/advisories/GHSA-2464-fhr4-w9xw)
describes a glibc/image-library condition; this app already pins Sharp 0.35.5 and
restricts optimization to maintained brand images. The
[`use cache` issue](https://github.com/advisories/GHSA-673q-mjm6-r5xr) requires cache
components/functions returning multiple typed arrays; those are not enabled here.
Neither condition was reproduced as an application RCE. The 16.4.1 update removes
both affected-version matches instead of relying on that assessment alone.

The full package audit initially reported two critical, five high, seven moderate
and one low advisory. After compatible updates it reports **one high advisory**,
the [Prisma configuration merge issue](https://github.com/advisories/GHSA-ggr8-5vv4-36mx).
This supersedes the dependency counts in the older [authentication review](AUTH_SECURITY_REVIEW.md).
The optional MySQL adapter remains patched and unused; PostgreSQL is unchanged.

### Proxy trust and availability

`AUTH_TRUST_PROXY` defaults to `false`. Production Compose sets it to `true` because
the application has no published port and its Caddy ingress overwrites `X-Real-IP`
with the socket peer. The auth library reads only that header, not a browser's
forwarded chain or Cloudflare header. Unit/integration checks distinguish client
buckets and verify the default distrust; network checks rotate spoofed forwarding
headers through Caddy and still reach the sign-in limit.

Keep the application reachable only through this ingress. Do not copy the setting
to a directly exposed Next.js process. If a CDN/load balancer is introduced, Caddy
will see that peer until its exact trusted topology is deliberately configured and
the spoofing tests repeated. A shared NAT also shares a client limit. Counters are
process-local and reset on restart; they are not a distributed or volumetric DoS
defense. The current one-app deployment does not justify Redis or another service.

Read limits allow the existing 60-second application upload deadline and normal
50-MiB model transport. The larger S3 allowance accommodates signed framing, not
larger admitted assets. No request/response buffering was added. Existing MIME,
extension, decoded-pixel, geometry, actual-stream-size and concurrent-decoder limits
still determine whether a file is accepted.

### Browser and logging policy

The CSP denies object embedding and framing, restricts base URLs and form targets,
and leaves the established Next.js scripts, theme initialization, Motion styles,
WebGL resources and explicitly opened video player working. It is a **baseline**
policy, not a strict script nonce policy and not proof that arbitrary script
injection would be blocked. No HTML injection sink was identified in the reviewed
renderers. A future strict script policy needs nonce propagation and full theme,
3D and video verification; it is not silently approximated with `unsafe-inline`.

HSTS applies only at HTTPS ingress, without `includeSubDomains` or preload. OAuth
responses retain their stronger `no-referrer` policy and generic error redirect.
The auth path has an explicit final matching header rule: the framework's general
header configuration otherwise overrides the route handler's stronger policy.
The proxy test forces a broken upstream with synthetic code/state/header sentinels;
the host harness checks the actual structured error output for their absence.
Disabling access logging alone would not protect error logs. Review any added host,
CDN, access-log or telemetry sink before letting it retain callback/private URLs.

## Reviewed controls

| Area             | Evidence and practical limit                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Docker           | Separate runtime/operations images, no host Docker socket or privileged containers, UID 1000/read-only web root, dropped capabilities, bounded scratch/cache and private backend network. Only Caddy publishes host ports. The database initializer needs its separate trusted startup privileges; container isolation is not a defense against a Docker administrator.                                                                                      |
| Secrets          | Tracked environment files are examples; Docker build excludes private env/export files and receives no runtime credentials. Provisioning writes generated Garage credentials atomically with mode 600 and suppresses raw child errors. Runtime receives its scoped DB/storage keys, not the database administrator password or backup key. Auth tokens are encrypted at rest by the auth adapter. This is not a historical secret-scanning attestation.      |
| Auth and roles   | Signed opaque secure/HttpOnly/host-only cookies, fixed expiry, no cookie authority cache, current verified identity and enabled grant reloaded server-side. Permission services revalidate inside mutation transactions. Unknown roles and forged/stale contexts fail closed; canonical/publication writes remain admin-only. Grant management requires a fresh session and protects the last administrator.                                                 |
| OAuth            | Exact origin checks, fixed HTTPS callback origin, library state/cookie binding and replay rejection, Google signature/issuer/audience/expiry verification, verified GitHub selected address, stable provider binding and disabled implicit linking. OAuth does not create access grants. Real provider console registration/consent remains a deployment check.                                                                                              |
| Uploads          | Authorized before admitting bytes and again before attachment; random object identities, private originals, typed metadata, supported formats only, actual stream bounds, decoded-image validation, metadata-stripped derivatives, one decoder per process and bounded scratch. GLBs reject external/data URIs, required decoder extensions, excessive JSON/geometry/textures and invalid buffer ranges. Native codecs must still receive security updates.  |
| PostgreSQL       | Separate administrator/migrator/runtime roles; runtime has DML, no role/database/schema creation, and no migration-ledger access. Only the internal network exposes PostgreSQL. SCRAM host authentication, bounded pool/statement/transaction timeouts, parameterized values and fixed identifier maps. Docker-host administrators can intentionally bypass these controls.                                                                                  |
| Object storage   | Internal Garage RPC/admin ports, token-protected administration, private bucket, application read/write key without bucket creation/ownership or other-bucket access, verified TLS from app to S3, strict object locators, bounded reads and integrity-checked uploads. The public S3 hostname requires signatures; anonymous raw object access is rejected. Garage's image contains no recognized packages for the scanner, which is a coverage limitation. |
| Reverse proxy    | Fixed app/storage host routing, overwritten forwarding headers, HTTPS with automated certificates in production, no public Caddy admin endpoint, ingress budgets and filtered error logs. A real host's firewall, DNS, certificate renewal and upstream proxies remain outside the local fixture.                                                                                                                                                            |
| Public endpoints | Dedicated public DTO queries, explicitly enabled collection and published items/media, approved rights and complete lineage checked per request, original assets kept private, private model inputs cannot become public by geometry approval. Counts/search/SEO/media share policy checks; revocable output is no-store and bypasses the image optimizer. Liveness reports only `ok`.                                                                       |
| Recovery         | Matched encrypted database/Garage/Caddy snapshots, separately held key, authenticated checksums and fresh-volume restore; restricted grants reapplied and sessions invalidated. Recovery stays offline for review of rolled-back rights/grants. Actual off-host storage, monitoring and scheduled server execution still require operator setup.                                                                                                             |

## Image audit and remaining release work

Image scanning uses Docker Scout's critical/high filter against the pinned local
images. Counts are package/advisory matches, including inactive tools and build
attestations; they are not counts of remotely exploitable vulnerabilities. Do not
suppress findings merely because the process is non-root.

The rebuilt web image (`sha256:5eed68f64a806d0dcf9c32840741ed816fa02ddaa868526e44239bce78d2036c`)
has **zero critical and nine high matches** across four Debian packages. Six are
in util-linux 2.38.1-5+deb12u3, and one each in Perl 5.36.0-7+deb12u4, OpenSSL
3.0.22-1~deb12u1 and zlib 1:1.2.13.dfsg-1. The scanner lists no fixed Bookworm
version for these remaining matches. The Node server is non-root, read-only and
cannot gain privileges; that bounds local-tool attacks, but is not a blanket
non-applicability statement for linked libraries. Keep these findings open for
vendor fixes and per-advisory assessment. The image's old Next.js and package-manager
advisory matches and fixable Perl/PCRE2 matches are absent after rebuilding.

The old web image reported 31 matches across 11 packages; the old Caddy image
reported 105 across 18. These prompted the base/proxy updates and runtime CLI
removal. The pinned PostgreSQL image reports 35 matches: 34 in the Go standard
library embedded in the startup-only `/usr/local/bin/gosu`, and one in libxml2.
`gosu` is not a network listener or HTTP/TLS parser for PostgreSQL, and SQL/XML is
not an application input API. This bounds exposure but does not remove package
findings. Follow PostgreSQL image rebuilds and libxml2 fixes without changing the
database major version or hand-replacing its privilege-drop initializer.

The replacement Caddy 2.11.7 image still reports **three critical and nine high
matches** across three packages. Its binary contains Go 1.26.8 and `golang.org/x/net`
0.59.0; scanner fixes point to Go 1.26.9 and `x/net` 0.60.0. The Alpine Brotli match
points to 1.2.1-r0. The Go HTTP/2 finding includes
[CVE-2026-78663's upstream backport](https://github.com/golang/go/issues/81906).
Unlike PostgreSQL's startup helper, this is the internet-facing server binary;
do not dismiss those matches as tooling. Remaining Caddy IDs are CVE-2026-56866,
78659, 78660, 78667, 78669, 94439, 94440, 97031, 97032, 78663, 56857 and 111497
(all with the `CVE-2026-` prefix). No exploit against this configured server was
attempted or demonstrated. A custom toolchain/dependency rebuild was not substituted
for the official image without a maintained release process; PROD-09 stays open.

The Node pin is the **24.22.1 security release**, including the October Brotli,
DNS, TLS and HTTP fixes. The host toolchain may be older; run production from the
reviewed image and update local Node separately. Container image package scans
do not replace checking Node's own embedded-library security releases.

The operations image (`sha256:10dfa884f8364ef673ec81c5552bd1f7a351c95dc5575bee022ea22e541afb0d`)
reports **one critical and 26 high matches** across ten packages. It shares the
nine Debian matches above; the rest are in global pnpm 11.5.0 and bundled
`tar`, `brace-expansion`, `undici` and `http-cache-semantics`. The critical match
is CVE-2026-59873 at
`/usr/local/lib/node_modules/pnpm/dist/node_modules/tar/package.json`, fixed by
tar 7.5.18 or later; the complete archive set points through 7.5.21. pnpm's own
findings include
[`patch-remove` deleting project-selected paths](https://github.com/advisories/GHSA-72r4-9c5j-mj57).
Neither pnpm nor archive extraction is exposed by the web image, which contains
neither package manager. Keep operations offline except for reviewed maintenance,
use the trusted committed repository/lockfile, and update the pinned host/container
toolchain together in the final remediation work. A workspace package audit alone
does not inventory this global tool tree.

### Garage source dependency cross-check

Scout recognized zero packages in the pinned Garage image. An additional
[OSV batch lookup](https://google.github.io/osv.dev/post-v1-querybatch/) checked
all 558 crates.io package/version entries in the upstream v2.4.1 Cargo.lock:
35 matches across 19 crate names and 31 advisory IDs. These are **not** 35 distinct
runtime vulnerabilities. Some records are aliases, some are maintenance notices,
and the source lock includes optional/build/test code. There is no feature-filtered
binary SBOM establishing which are compiled into the pinned image.

| Source lock entry                                                                     | Advisory examples / vendor fix direction                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quick-xml` 0.39.2                                                                    | [RUSTSEC-2026-0194](https://rustsec.org/advisories/RUSTSEC-2026-0194.html) and [0195](https://rustsec.org/advisories/RUSTSEC-2026-0195.html): XML CPU/allocation exhaustion; patched at 0.41.0. A transport byte/time limit alone does not eliminate synchronous parser work. |
| `h2` 0.3.27 / 0.4.13                                                                  | [RUSTSEC-2026-0258](https://rustsec.org/advisories/RUSTSEC-2026-0258.html): empty-frame queue growth; patched at 0.4.16. Caddy uses HTTP/1.1 upstream here, narrowing this path without clearing the complete binary.                                                         |
| `rustls` 0.21.12 / 0.23.39                                                            | RUSTSEC-2026-0285, 0346, 0348, 0349: handshake, debug-secret, certificate-decompression and downgrade conditions; fixed 0.23 releases extend through 0.23.46.                                                                                                                 |
| `rustls-webpki` 0.101.7 / 0.103.13; `webpki-root-certs` 1.0.7                         | RUSTSEC-2026-0098, 0099, 0104, 0382, 0383: certificate constraints/CRL/root distrust; fixes extend through 0.103.16 / 1.0.10.                                                                                                                                                 |
| `anyhow` 1.0.102; `crossbeam-epoch` 0.9.18; `event-listener` 5.4.1                    | RUSTSEC-2026-0190, 0204, 0221: library soundness conditions; fixes 1.0.103 / 0.9.20 / 5.4.2.                                                                                                                                                                                  |
| `ctutils` 0.4.2; `cmov` 0.5.3                                                         | RUSTSEC-2026-0385 / GHSA-3rjw-m598-pq24: constant-time/correctness conditions; fixes 0.4.4 / 0.5.4.                                                                                                                                                                           |
| `lru` 0.16.4; `tokio` 1.52.1; `xxhash-rust` 0.8.15                                    | RUSTSEC-2026-0253, 0386 / GHSA-6g2r-675j-hx59: panic/I/O/API soundness; applicable fixes 0.18.2 / 1.53.3 / 0.8.16.                                                                                                                                                            |
| `aws-smithy-json` 0.62.5; `protobuf` 2.28.0                                           | GHSA-8ffr-xgwf-xj56 / RUSTSEC-2024-0437 (also GHSA-2gh3-rmm4-6rq5): recursive parser conditions; fixes 0.62.7 / 3.7.2. Generated-server use and actual compiled paths require verification.                                                                                   |
| `paste` 1.0.15; `proc-macro-error` 1.0.4; `structopt` 0.3.26; `unsafe-libyaml` 0.2.11 | RUSTSEC-2024-0436, 2024-0370, 2022-0104, 2024-0449 are maintenance notices, not standalone proofs of exploitable bugs.                                                                                                                                                        |

The primary release feed could not be retrieved by the review browser. The official
GitHub mirror publishes its [security reporting policy](https://github.com/deuxfleurs-org/garage/blob/v2.4.1/SECURITY.md)
and had no published repository advisories; that does not negate crate advisories.
Retain the private bucket/key, closed admin/RPC ports and ingress limits while
the vendor release/build and configured code paths are assessed. No malicious
parser/TLS payload was run against Garage and no exploit is claimed.

Before a live release, the operator must review remaining image advisories against
the actual architecture and enabled modules, refresh supported image digests when
fixes land, configure host firewall/patching and disk/backup monitoring, verify
real OAuth/certificates, and rehearse recovery from off-host storage. The reviewed
single-host replicas share a failure domain. Public traffic can still exhaust
network/CPU resources; ingress/platform abuse protection is deployment work.

## Verification

Verified on 2026-10-23: **1,479 unit/component cases, 184 focused PostgreSQL
integration cases, three backup cases and ten desktop/mobile browser cases pass**.
Lint, type checking, formatting, documentation links and whitespace checks pass.
The integration selection is `auth`, `access`, `permissions` and `public-collection`;
other domain integration suites were not rerun as part of this review.

Commands:

```sh
pnpm test --maxWorkers=2
pnpm test:integration tests/integration/auth.test.ts tests/integration/access.test.ts tests/integration/permissions.test.ts tests/integration/public-collection.test.ts
pnpm test:backup
pnpm test:production
pnpm audit --json
```

Use `docker scout cves --format sarif --only-severity critical,high local://IMAGE`
against the exact built image or pinned `name@sha256:...` reference, and inspect
package locations and vendor fixes before assessing reachability. A nonzero audit
finding is recorded above, not treated as a passing security scan.

`pnpm test:production` builds the runtime/operations images, checks private ports,
UID/filesystem/tool boundaries and database roles, runs desktop/mobile upload,
private/public media and ingress security checks, then recreates retained services
and performs the encrypted backup/restore round trip. The synthetic broken-upstream
route exists only in the test proxy configuration, never in the application or
production Caddyfile.

References: [Better Auth security](https://better-auth.com/docs/reference/security),
[auth rate limits and trusted client IP](https://better-auth.com/docs/concepts/rate-limit),
[Next.js CSP guidance](https://nextjs.org/docs/app/guides/content-security-policy),
[Caddy body limits](https://caddyserver.com/docs/caddyfile/directives/request_body),
[Caddy timeouts](https://caddyserver.com/docs/caddyfile/options#timeouts),
[structured log filtering](https://caddyserver.com/docs/caddyfile/directives/log#filter),
[Caddy releases](https://github.com/caddyserver/caddy/releases) and
[Node.js 24.22.1 security release](https://nodejs.org/en/blog/release/v24.22.1).
