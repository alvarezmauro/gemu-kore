# Backup and recovery

Task 22.2 backs up the [production Docker deployment](PRODUCTION_DOCKER.md).
Every completed backup is one matched snapshot: PostgreSQL, all three Garage
nodes (metadata **and** object blocks), the private deployment environment and
Caddy's two retained volumes. Backups include private originals, processed
images, GLBs, asset lineage/approvals, identities and grants. They contain secrets
and must stay encrypted. Garage replication and Docker volumes alone are not backups.

## Consistency, availability and recovery limits

This is a daily full backup with a maintenance window. The tool requires a healthy
stack and no running migration/storage/operator job. It drains/stops the app while
Caddy's S3 route remains available, then stops the proxy and all Garage nodes,
before taking a PostgreSQL 16 custom-format `pg_dump` and
archiving the stopped Garage/Caddy volumes. It resumes the existing services before
encrypting and verifying the backup. Writes cannot cross the database/object-store
snapshot boundary. Do not run deployment, grant administration, other database
clients, or another operator's storage tools during this window.

The site is unavailable during the dump and volume copies. Duration and temporary
disk usage grow with the collection; three complete Garage replicas are copied.
This deliberate cold snapshot preserves Garage keys, bucket aliases, node identities,
layout, metadata and blocks together. Copying only the data directories, or copying
live LMDB files, is not the supported recovery procedure. This task does not add
point-in-time database recovery or a second live site.

The sample timer runs daily at 03:15 in the server's timezone, with up to five minutes
of randomized delay. The recovery point objective is the last **successful** daily
backup (normally up to about 24 hours); monitor failures and disk space. There is no
measured production recovery-time guarantee. Rehearse a restore after deployment
changes and regularly thereafter. Cryptographic verification alone does not prove
that a database or application can be restored.

## Initial configuration

Use the repository's Node.js 24 toolchain and Docker Compose. No extra application
package, backup server or storage SDK is required. Run from the repository root.

1. Arrange a mounted **off-host** filesystem, such as `/mnt/gemukore-backups`.
   Its contents must survive loss of the Docker host. A local directory is useful
   for testing but does not satisfy that recovery requirement. Give the trusted
   operator read/write access and enough free space. The timer checks that the
   mount exists before running; adapt both the unit and the configuration if the
   mount path changes.
2. Create the encryption key outside the checkout and backup destination:

   ```sh
   umask 077
   openssl rand -hex 32 > /etc/gemukore/backup.key
   ```

   Prepare `/etc/gemukore` with appropriate ownership first. The key must be a
   regular file with no group/other permissions (normally mode 600), readable by
   the backup operator. Keep a separate protected offline/password-manager copy.
   Losing the host **and** this key makes the backups unrecoverable. Do not put the
   key on the backup mount or paste it into logs, chat, Git or `.env.production`.

3. Set these fields in the ignored production environment:

   ```dotenv
   PRODUCTION_PROJECT_NAME=gemukore-production
   BACKUP_DIRECTORY=/mnt/gemukore-backups/gemukore
   BACKUP_KEY_FILE=/etc/gemukore/backup.key
   BACKUP_KEEP_COUNT=14
   ```

   `BACKUP_KEEP_COUNT` keeps the newest 1–365 completed sets for this installation
   and encryption key, default 14. Pruning happens only after a new backup has been
   encrypted, authenticated and checksum-verified. Foreign, incomplete, symlinked,
   corrupt-manifest and older-key directories are not automatically deleted.
   Changing keys does not re-encrypt older sets; retain each needed old key.

4. Use a committed, identified release and keep its application/operations images
   in your release repository/registry. The encrypted manifest records the Git
   revision, dirty-checkout flag, configured image references, backend versions,
   CPU architecture and deployment configuration hashes. This is a **data** backup;
   it does not export Docker images, your Git repository, host setup or the key.
   Recovery needs the matching checkout and image versions. Garage volume recovery
   requires the same Docker CPU architecture and pinned Garage version.
5. Reserve a private staging directory with enough local space for roughly two
   compressed full sets, in addition to retained backups. The default is the OS
   temporary directory. For server automation, create an operator-owned mode-700
   `/var/lib/gemukore-backup/work` and set `BACKUP_WORK_DIRECTORY` in the operator
   environment. Staging contains temporary plaintext while the command runs; use
   a trusted, preferably encrypted host filesystem. Cleanup removes these files
   normally, but is not forensic secure erasure and cannot run after power loss.

The backup operator's Docker access is host-administrator authority. The web
application keeps its restricted database/storage credentials; it never receives
the encryption key or backup-directory access.

## Create and verify

```sh
pnpm backup:create --env-file .env.production
pnpm backup:verify --directory /mnt/gemukore-backups/gemukore/COMPLETED-SET --key-file /etc/gemukore/backup.key
```

Replace `COMPLETED-SET` with the path returned by `create`. Successful commands
return a small JSON receipt, never database contents or credentials.
Verification also reports the recorded revision, architecture and image references
needed to select a recovery release. Each set is a
private directory containing eight encrypted files: database dump, environment,
five volume archives and the manifest. The files use versioned AES-256-GCM with a
fresh random 96-bit nonce per file, an authenticated filename and a 128-bit tag.
The encrypted manifest also contains plaintext-file SHA-256 hashes and sizes.
Verification authenticates and checks every file before declaring success.
Each compressed payload must be smaller than GCM's approximately 64-GiB
per-message limit; larger installations need a reviewed chunked backup format.

The tool publishes a completed directory only after full verification. Keep the
whole directory together with its original name. Unknown/missing files, wrong keys, tampered bytes and
checksum mismatches fail verification. A failed create does not replace an older
backup. Same-installation jobs use an atomic lock under the operator's temporary
directory; use one trusted operator/account and coordinate all deployments and
maintenance. Do not manually launch a second backup under another OS account.

Normal failure or SIGINT/SIGTERM during a snapshot attempts to resume the source
Garage/app/proxy services. SIGKILL, power loss or a failed Docker daemon cannot be
handled in-process. If a job was interrupted, inspect the private service state
before restarting it:

```sh
docker compose --env-file .env.production -f docker-compose.production.yml start --wait garage1 garage2 garage3
docker compose --env-file .env.production -f docker-compose.production.yml start --wait app proxy
```

Review and remove a stale `.gemukore-INSTALLATION-backup.lock` directory from the
operator's OS temporary directory only after confirming no backup is still running.
Incomplete hidden directories on the backup mount are never recovery candidates.
After an abrupt host failure, inspect leftover `gemukore-backup-*` staging directories
privately and remove only confirmed abandoned staging data.

## Automate on a Linux Docker host

The templates in `docker/backup/` assume an operator account `gemukore`, checkout
`/srv/gemukore`, Node 24 at `/usr/bin/node`, and mount `/mnt/gemukore-backups`. Adapt
those paths/account to the real server before installing. The account needs Docker
access and permission to read its mode-600 environment/key and write staging/backups.
The service fails rather than silently falling back to local disk if the off-host
mount is absent. It allows time for graceful cancellation/service recovery.

```sh
sudo install -m 644 docker/backup/gemukore-backup.service /etc/systemd/system/gemukore-backup.service
sudo install -m 644 docker/backup/gemukore-backup.timer /etc/systemd/system/gemukore-backup.timer
sudo systemctl daemon-reload
sudo systemctl start gemukore-backup.service
sudo systemctl enable --now gemukore-backup.timer
systemctl list-timers gemukore-backup.timer
systemctl status gemukore-backup.service
journalctl -u gemukore-backup.service
```

Verify a manual run and off-host file availability before enabling the timer. Check
the returned receipt, failed service state, backup age, destination capacity and
periodic recovery results in the server's monitoring. A catch-up run after downtime
(`Persistent=true`) also causes a maintenance window. These are server deployment
templates; this task does not install or activate a timer on this laptop.

## Restore into a new installation

1. Recover the matching repository revision, production images, full encrypted
   set and separately held key. Review a dirty-checkout manifest against your release
   records; recover any uncommitted deployment changes separately. Use a trusted
   backup only: restoring SQL executes code captured from the original database.
2. Choose a new lowercase volume/project prefix and a new environment-file path.
   Keep the existing installation available for investigation; restoration refuses
   existing target volumes, target containers, an existing output file or the
   source volume prefix. It authenticates every encrypted file and checks deployment
   hashes, backend images and architecture before writing database/asset volumes.

   ```sh
   pnpm backup:restore --directory /mnt/gemukore-backups/gemukore/COMPLETED-SET --key-file /etc/gemukore/backup.key --volume-prefix gemukore-recovery-20261023 --env-output /secure/gemukore-recovery.env
   ```

3. The command creates **new** external volumes, restores all Garage/Caddy archives,
   initializes PostgreSQL's separate roles, and restores the dump in one transaction.
   It reapplies restricted runtime/default grants, denies migration-ledger access,
   invalidates restored sessions and analyzes the database. Identities, verified
   provider bindings and access grants remain; users sign in again normally.
   Garage's existing bucket/key/layout are verified without generating replacement
   credentials. The app and proxy stay stopped for review. A failed recovery target
   is left offline for diagnosis; it is not silently deleted or reused on retry.
4. Review the mode-600 recovery environment. It has a distinct project/volume prefix
   and loopback-only proxy binding on 18080/18443. Keep it private: it contains the
   original database passwords, OAuth credentials, auth secret and storage key.
   The backup key is not embedded. Adapt host-specific backup/key paths. Use a
   temporary reviewed domain/certificate setup for a rehearsal; the application
   still enforces HTTPS and its fixed configured origin.
5. Start the restored application only after reviewing the target configuration:

   ```sh
   docker compose --env-file /secure/gemukore-recovery.env -f docker-compose.production.yml up --detach --wait
   ```

   Its `PRODUCTION_PROJECT_NAME` keeps it separate from the original deployment.
   Check migration status, health, normal verified-provider sign-in, current roles,
   private original/derived images, a model's range/full delivery, publication/rights
   gates and a representative collection record. For a live cutover, deliberately
   set the reviewed domains, public bind address and host ports, adjust DNS/OAuth
   callbacks as needed, then recreate the recovered app/proxy. Do not expose both
   old and recovered writable sites to users at once.

Recovery restores the snapshot's metadata and bytes. Publication/rights withdrawals,
grant changes and deletions made **after** that snapshot are not recoverable from it;
review those before enabling a public collection. Never merge only an older database
or only older object volumes into a running installation. Keep the original volumes
until the recovered installation has passed checks and the operator deliberately
retires them.

## Verification

`pnpm test:backup` tests streaming encryption round trips, changed bytes, wrong keys,
filename substitution, truncation, private key permissions and refusal to overwrite
an existing recovery file. `pnpm test:production` additionally creates a matched
backup of the real isolated Docker stack after real photo/GLB uploads. It damages
an encrypted dump and verifies rejection, restores into a new project/volume set,
compares every application table's hash except intentionally revoked sessions,
reads and hashes every READY asset, and checks restored private photo/model access
in desktop/mobile Chromium. Source restart and target-reuse refusal are exercised.
Only uniquely labelled test resources are cleaned up.

Verified on 2026-10-23: the complete Docker backup/restore rehearsal passes, including
both desktop/mobile deployment journeys and both restored-media browser checks.
All 1,478 unit/component cases and three backup test cases pass, along with lint,
type checking, formatting, local documentation links and whitespace checks.

This local rehearsal does not establish a real off-host mount, server timer execution,
host-loss recovery duration, live DNS/certificate issuance or external OAuth consent.
Test those on the chosen server before relying on the scheduled backup.

References: [PostgreSQL SQL dumps](https://www.postgresql.org/docs/16/backup-dump.html),
[pg_dump](https://www.postgresql.org/docs/16/app-pgdump.html),
[pg_restore](https://www.postgresql.org/docs/16/app-pgrestore.html),
[Garage configuration and metadata durability](https://garagehq.deuxfleurs.fr/documentation/reference-manual/configuration/),
[Garage recovery](https://garagehq.deuxfleurs.fr/documentation/operations/recovering/)
and [Node.js authenticated encryption](https://nodejs.org/docs/latest-v24.x/api/crypto.html#class-cipheriv).
The file-size guard follows [NIST SP 800-38D §5.2.1.1](https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=51288);
timer behavior follows [systemd.timer](https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html).
