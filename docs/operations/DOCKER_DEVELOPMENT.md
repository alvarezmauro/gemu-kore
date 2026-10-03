# Docker development

Task 1.3 provides `app`, `postgres` and `minio` services in `docker-compose.yml`. This is a local development environment; production packaging belongs to Phase 22.

## First setup

Install Docker with Compose and start its engine. Local Next.js development also needs the Node.js/pnpm versions in [README.md](../../README.md). Run from the repository root:

```sh
# Keep an existing file: it contains the Task 1.2 database password.
test -f .env.local || cp .env.example .env.local
pnpm docker:up
pnpm db:deploy
pnpm db:check
pnpm dev
```

`docker:up` prepares the persistent volumes, builds MinIO and starts PostgreSQL/MinIO, waiting for their health checks. Next.js runs on the host using `.env.local` and the published service ports. The initial source/image/dependency downloads can take several minutes; subsequent builds use Docker's cache. No migrations run automatically at service startup.

For a fresh environment, `.env.example` contains local-only sample credentials. For an existing Task 1.2 setup, retain `DATABASE_URL` and add the matching `POSTGRES_USER`, `POSTGRES_DB`, `POSTGRES_PASSWORD` and `POSTGRES_PORT` plus the MinIO settings from the example. Passwords used in Compose's generated database URL must be URL-safe. The current setup uses generated credentials stored only in `.env.local`.

Compose explicitly reads `.env.local` through `--env-file`; it does not rely on its default `.env` lookup. Shell environment values override that file. Avoid printing the fully expanded Compose configuration because it contains credentials; validate with `docker compose --env-file .env.local --profile app config --quiet`.

## Run Next.js in Docker

```sh
pnpm docker:app
```

The optional `app` profile starts all three services. Open [localhost:3002](http://localhost:3002). The separate port allows a local Next.js process to keep running. `APP_PORT` can change the published Docker app port; it does not change the port used by local `pnpm dev`.

The development image pins Node.js and pnpm. Source is bind-mounted for live edits. Container dependencies, `.next` output and generated Prisma files have separate volumes, so Linux dependencies/build artifacts do not replace host files. The app installs against the frozen lockfile at startup to pick up dependency changes, generates Prisma and starts the development server. Rebuild after changing the Dockerfile or toolchain; dependency-only changes are also picked up by a restart.

The image build copies only dependency manifests. `.dockerignore` excludes local secrets, Git history, host dependencies and generated outputs. The development container has access to the bind-mounted working tree at runtime; it is not a production image. Next.js uses the server environment supplied by Compose, which overrides the host-oriented values in the mounted `.env.local`.

| Service           | From the host           | From the app container  |
| ----------------- | ----------------------- | ----------------------- |
| Next.js in Docker | `http://localhost:3002` | `http://127.0.0.1:3000` |
| PostgreSQL        | `127.0.0.1:5433`        | `postgres:5432`         |
| MinIO S3 API      | `http://127.0.0.1:9000` | `http://minio:9000`     |
| MinIO console     | `http://127.0.0.1:9001` | `http://minio:9001`     |

`POSTGRES_PORT`, `MINIO_API_PORT` and `MINIO_CONSOLE_PORT` change host bindings. Keep host `DATABASE_URL`/`S3_ENDPOINT` consistent with those ports. Internal service ports stay fixed. Use the MinIO credentials in `.env.local` to sign in to the console.

Database operations from inside the app container use its internal connection URL:

```sh
docker compose --env-file .env.local exec app pnpm db:status
docker compose --env-file .env.local exec app pnpm db:check
# Apply reviewed migrations explicitly when needed:
docker compose --env-file .env.local exec app pnpm db:deploy
```

## Stop, restart and preserve data

```sh
pnpm docker:status
pnpm docker:logs
pnpm docker:down
pnpm docker:up
# Or restart the optional Docker app together with its dependencies:
pnpm docker:app
```

`docker:down` removes the project containers/network. Database and object bytes remain in external volumes `gemukore-postgres-data` and `gemukore-minio-data`, including when Compose is explicitly given `--volumes`. `docker:prepare` creates those volumes if absent and reuses them otherwise. App dependency/build volumes are disposable caches. Removing a data volume manually destroys its contents; recreating containers does not.

The Compose project is named `gemukore`. It does not manage containers belonging to other projects. Changing `POSTGRES_PASSWORD` cannot change the password already stored in PostgreSQL's volume; retain the established credentials or rotate them through PostgreSQL deliberately.

### Task 1.2 handoff

The standalone Task 1.2 container used the same database volume and port. It must be stopped before Compose starts its PostgreSQL service. On this workspace the handoff was completed while preserving the volume and migration history. Do not start a second PostgreSQL process against that data directory.

For another checkout still using the standalone container, stop `gemukore-postgres`, confirm `.env.local` contains its existing password and use `pnpm docker:up`. Once the Compose database has passed `pnpm db:check` and `pnpm db:status`, the old stopped container can be removed without removing its volume.

## Health and storage scope

PostgreSQL readiness uses `pg_isready`; MinIO readiness uses `/minio/health/ready`. The app starts after both pass and has its own `/api/health` liveness check. `pnpm db:check` separately verifies an authenticated Prisma connection. Health dependencies order startup; they do not guarantee a dependency remains available afterward.

No bucket is made public. Storage integration, upload processing and application access policies remain Phase 5. `S3_BUCKET=gemukore-dev` reserves the intended local bucket name; this task does not automatically provision it. The temporary verification bucket is removed after checks. Local root MinIO credentials are for this development sandbox; Phase 5 must establish the application's storage access policy.

## MinIO source build

MinIO's community repository is archived, and the historical public image could not be pulled during this task. The development Dockerfile builds upstream release `RELEASE.2025-10-15T17-29-55Z`, commit `9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a`, instead. Go downloads are checked through its module checksum system. The source revision and build/runtime base images are pinned; the image retains MinIO's license and runs the server as a non-root user.

This keeps the requested local MinIO environment usable but does not provide ongoing upstream maintenance. Reassess the production object-storage choice before deployment. [Upstream repository and source-build guidance](https://github.com/minio/minio), [pinned release](https://github.com/minio/minio/releases/tag/RELEASE.2025-10-15T17-29-55Z).

Service selection and readiness follow Docker's [Compose profiles](https://docs.docker.com/compose/how-tos/profiles/) and [startup ordering](https://docs.docker.com/compose/how-tos/startup-order/) documentation.

## Task 1.3 verification

Verified on 2026-10-03:

- Compose configuration parses, all published ports bind to loopback, and data volumes are external.
- Both development images build; the app image contains neither `.env.local` nor Git history.
- All three services pass their health checks. Prisma connectivity and migration status pass from both the host and the app container.
- Existing PostgreSQL migration history and a private MinIO object's contents survive forced container recreation. Anonymous object reads are denied; the temporary object and bucket were removed.
- A full Compose teardown and restart preserves the external data volumes. Default startup runs only PostgreSQL and MinIO; the optional app profile restores all three services.
- The Docker app renders in a browser without errors. Both local and containerized Next.js detect a temporary source edit and its restoration.
- Host lint, typechecking and production build pass; container typechecking also passes. Production deployment and persistent test infrastructure remain later tasks.
