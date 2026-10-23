# Production Docker

Task 22.1 provides a single-host deployment using Caddy, a standalone Next.js
image, PostgreSQL 16 and Garage S3 storage. Development continues to use the
separate [development stack](DOCKER_DEVELOPMENT.md). No real server, DNS record,
OAuth application or production account is created by these files.

## Services and boundaries

Only Caddy publishes host ports, TCP 80 and 443. It obtains and renews HTTPS
certificates for the application and storage hostnames. PostgreSQL, the Next.js
port, Garage RPC and Garage administration have no published ports. The backend
network is internal. The app also joins the edge network for outbound OAuth and
optional provider requests.

The storage hostname resolves to Caddy inside Docker as well as through public
DNS. This preserves verified HTTPS and the signed S3 Host/URI without depending
on the host's public-IP hairpin routing. Caddy forwards signed storage requests
without path rewrites. The private bucket has no website access or anonymous
read permission. Browser uploads and media reads still go through application
authorization; a publicly reachable S3 endpoint does not publish the objects.
Neither proxy route adds a media cache. Streaming and Range requests reach the
existing application/storage adapters.

Garage uses three storage nodes and replication factor three. **All replicas
live on the same Docker host.** This is not protection against host or disk
loss and is not a high-availability deployment. Allow approximately three times
the logical object size, plus metadata, database, images and free space. Set
`GARAGE_NODE_CAPACITY` to the intended capacity of each replica, taking the
shared host disk into account. Docker volumes do not enforce that quota.
Task 22.2 adds [encrypted matched backups and a tested restore procedure](BACKUP_RESTORE.md);
configure an off-host destination before relying on them. The
[production security review](../architecture/PRODUCTION_SECURITY_REVIEW.md) records
the reviewed boundaries and unresolved release blockers; completing local tests
does not approve a live deployment.

The web image runs as UID 1000 with a read-only root filesystem, dropped
capabilities and bounded temporary/cache mounts. It contains Next's traced
runtime, static files and public assets. Migrations, trusted operator tools and
development dependencies live in a separate operations image. No build receives
database, OAuth or storage credentials. Environment files are excluded from the
build context. Build-only type checks include the shared `tests/` directory;
that directory is not copied into either final image.

PostgreSQL initializes three distinct credentials on a **new empty volume**:

| Role                | Use                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `postgres`          | Private database administration and initial role creation                                                                     |
| `gemukore_migrator` | Database ownership, committed migrations and trusted operator tools                                                           |
| `gemukore_app`      | Runtime domain-table reads/writes; no superuser, role creation, database creation, schema creation or migration-ledger access |

Garage's separate RPC secret and administration token are supplied only to
storage services/setup. The application key receives read/write permission on
the configured bucket, with no bucket ownership or bucket-creation permission.
Setup refuses existing keys with broader bucket permissions or different
secrets. These boundaries do not make a host administrator untrusted: Docker
administrators can inspect container environments and persistent volumes.

## First deployment

Use a Docker host with a current Compose plugin supporting conditional
dependencies and `up --wait`. Build images on the target CPU architecture.
Provide enough memory for the Next.js build and enough disk for three object
replicas. The implementation has no measured production capacity guarantee.

1. Create two DNS records, such as `collection.example.com` and
   `storage.example.com`, pointing to the host. Check both A and any AAAA
   records. Open inbound TCP 80/443 and permit outbound DNS/HTTPS. Keep the
   Caddy data volume across updates so certificates and renewal state persist.
2. Copy the production template and restrict its permissions:

   ```sh
   cp .env.production.example .env.production
   chmod 600 .env.production
   ```

3. Fill `APP_DOMAIN` and `STORAGE_DOMAIN` with distinct DNS names, without
   schemes, ports or paths. Set `ACME_EMAIL` to the certificate registration
   contact email. Keep `S3_ENDPOINT=https://${STORAGE_DOMAIN}`,
   `S3_REGION=garage` and `S3_FORCE_PATH_STYLE=true`. Choose a lowercase S3
   bucket name. Generate a different URL-safe secret for each database role,
   `BETTER_AUTH_SECRET`, `GARAGE_RPC_SECRET` and
   `GARAGE_ADMIN_TOKEN`, using `openssl rand -hex 32`. Leave both S3 credential
   markers as `PROVISION_WITH_GARAGE` for the provisioning command below. Garage
   must generate its own access key identifiers. Never use the
   example hostnames or reuse development credentials. Database passwords are
   interpolated into URLs, so use the suggested hexadecimal characters.
4. Configure at least one OAuth provider for actual sign-in. Register the exact
   application callbacks:

   ```text
   https://collection.example.com/api/auth/callback/google
   https://collection.example.com/api/auth/callback/github
   ```

   Set both variables of each enabled provider pair. Empty pairs safely disable
   that provider. See [authentication](AUTHENTICATION.md) for identity rules.
   The deployment derives `BETTER_AUTH_URL` from `APP_DOMAIN`; request headers
   cannot override it. Optional metadata provider pairs may remain empty.

5. Assign matching, distinct release tags to `GEMUKORE_IMAGE` and
   `GEMUKORE_OPERATIONS_IMAGE`. From the repository root, prepare retained
   volumes, validate configuration, build and start:

   ```sh
   pnpm docker:prod:prepare
   docker compose --env-file .env.production -f docker-compose.production.yml config --quiet
   pnpm docker:prod:build
   pnpm docker:prod:storage
   pnpm docker:prod:up
   pnpm docker:prod:status
   ```

   `config --quiet` validates without printing resolved secrets. Avoid sharing
   ordinary `config` output. Preparation only creates the six configured
   external volumes; it never formats or deletes an existing volume. Keep the
   same `PRODUCTION_VOLUME_PREFIX` for the same installation.

   `docker:prod:storage` starts the three Garage nodes, initializes their layout
   and private bucket, asks Garage to generate a scoped key, then atomically
   replaces only the two S3 markers in `.env.production` with mode 600. It captures
   credentials privately and does not print them. Repeating it verifies existing
   credentials and leaves the environment file unchanged. Do not run provisioning
   concurrently or edit the file during provisioning. If interrupted before the
   file is saved, review keys through Garage administration before retrying;
   startup never guesses a missing key or silently rotates an existing one.

6. Check `https://collection.example.com/api/health`, then the login screen.
   The health endpoint is intentionally liveness only; it does not expose
   database status or credentials. Startup separately waits for PostgreSQL,
   committed migrations, Garage layout/bucket/key setup and the app healthcheck.
   Confirm Caddy has obtained valid certificates for **both** hostnames before
   uploading. Check provider login and private access using the intended account.
7. Create the first administrator through the existing trusted operator CLI:

   ```sh
   docker compose --env-file .env.production -f docker-compose.production.yml run --rm operations exec node --conditions=react-server --import tsx scripts/access-admin.ts bootstrap --email 'your-verified-email@example.com' --operator 'your-name'
   ```

   This creates a grant, not a fabricated identity or session. Sign in normally
   through the verified provider afterward. Keep the operator receipt privately.
   Recovery uses the same command with `recover` and its explicit reason and
   identity arguments; see [access grants](ACCESS_GRANTS.md).

## Updates, shutdown and existing data

Use the runtime and operations images built from the **same revision**. Review
migrations and take a verified matched backup using the
[backup workflow](BACKUP_RESTORE.md) before applying a release. Build the new release tags, then rerun
`pnpm docker:prod:up`. Compose runs the migration image before starting the app.
To explicitly recheck setup without changing the image:

```sh
docker compose --env-file .env.production -f docker-compose.production.yml run --rm migrate
docker compose --env-file .env.production -f docker-compose.production.yml run --rm storage-init
```

Setup is idempotent for the same intact storage cluster, bucket and key. It
does not rotate credentials, silently replace lost node identities, rebalance
an existing layout or enable public bucket access. Unexpected layouts,
staged initial layout edits and incompatible keys require operator review.
Changing capacity in the environment does not rewrite an existing layout.

`pnpm docker:prod:down` removes containers and networks while retaining all six
external volumes: PostgreSQL, three Garage nodes, Caddy data and Caddy config.
Recreating containers with the same configuration reuses those volumes. Do not
delete them to solve startup failures. Replication and retained volumes are not
backups. A previous application image may be incompatible with a newer schema;
do not assume image rollback reverses database migrations.

Editing PostgreSQL password variables does not change passwords in an existing
database. Garage setup similarly refuses a changed secret for an existing key.
Credential rotation and damaged-cluster recovery require deliberate operator
procedures; they are not automatic side effects of container startup.

The proxy is intended as the directly reachable edge. Its forwarding headers
are reset to the connected peer. Compose explicitly enables `AUTH_TRUST_PROXY`
so sign-in limits use only Caddy's overwritten `X-Real-IP`; other configurations
default to trusting none. Do not publish the app port or enable this flag on a
directly reachable server. If another proxy/CDN is introduced, review the exact
trusted topology and repeat spoofing tests. These process-local counters are not
IP-based authorization or a distributed traffic-abuse defense.

The ingress limits ordinary bodies to 1 MiB, raw upload bodies to 50 MiB and S3
transport to 64 MiB. Application image/template limits remain narrower. Headers
must arrive within 10 seconds and bodies within 90 seconds; idle keep-alive is
two minutes. HTTPS responses receive one-year HSTS without subdomain/preload
opt-in. Next.js applies the reviewed framing/MIME/referrer/feature/CSP headers.
Default proxy error logs omit request URIs/headers and response headers; access
logging stays disabled. Review any added logging sink for OAuth/private data.

For private troubleshooting, use scoped service logs and `ps`; never publish
container inspection, resolved environments, OAuth responses or raw logs that
could contain private request data. A stuck migration prevents the app from
starting. A failed storage setup reports a sanitized error and leaves existing
data intact. Inspect the private Garage status through an operator container
or the Garage CLI before making layout changes.

## Verification

Run `pnpm test:production` with Docker, OpenSSL and Playwright Chromium installed.
It builds both production targets without credentials, creates unique labelled
test volumes and starts the actual PostgreSQL/Garage/Caddy/app stack. The test
override changes only the HTTPS certificate/domain, loopback host ports and
test-only fixture mounts/environment. It uses a one-day local certificate and
trusts its public certificate inside Node; server-side TLS verification stays
enabled. It does not contact a live OAuth provider or request public certificates.

The suite checks role separation, absence of published internal ports, runtime
isolation, actual photo processing, GLB validation/rendering, signed S3 reads,
Range delivery, anonymous/private denial and immediate public-rights/session
revocation on desktop/mobile Chromium. It recreates containers, reruns migrations
and storage setup, and verifies retained database values and identical object
bytes. Fixture commands run only in a temporary operations container with the
test directory mounted read-only; neither release image has a test login route
or baked-in browser fixture. Cleanup targets only this run's labelled volumes.
Ports 3110/3111 must be available.

Live DNS, ACME issuance/renewal, external OAuth consent, a real host firewall,
host failure, load capacity and off-host restore are not established by a local
Docker smoke test. No live deployment is performed by this task.

Verified 2026-10-23 on local Docker: both release targets build without credentials;
production Caddy configuration validates; all services start with the runtime
restrictions above. Provisioning saves a mode-600 environment file and a repeated
run preserves it exactly. Both desktop/mobile workflows pass, followed by complete
container recreation, idempotent migration/storage setup, role checks and retained
database/object-byte checks. All test containers and labelled volumes are removed.
Lint, TypeScript, formatting, documentation links/fences, 1,478 unit/component tests
and 133 selected database/schema/access/permission integration tests pass. Lint
configuration initialization now happens in the boundary suite's setup, keeping
its assertions and five-second case deadlines unchanged.

Implementation references: [Next.js standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output),
[Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https),
[Caddy reverse proxy behavior](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy),
[Garage configuration](https://garagehq.deuxfleurs.fr/documentation/reference-manual/configuration/),
[Garage quick start and replication guidance](https://garagehq.deuxfleurs.fr/documentation/quick-start/),
[Garage reverse proxy](https://garagehq.deuxfleurs.fr/documentation/cookbook/reverse-proxy/)
and [Garage administration API](https://garagehq.deuxfleurs.fr/documentation/reference-manual/admin-api/).
