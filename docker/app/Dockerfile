# syntax=docker/dockerfile:1
FROM node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS base
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
RUN npm install --global pnpm@11.28.8
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY prisma.config.ts next.config.ts tsconfig.json postcss.config.mjs ./
COPY prisma ./prisma
COPY src ./src
COPY public ./public
# The repository typecheck includes colocated tests and their shared helpers.
# These are build inputs only; neither final image copies this directory.
COPY tests ./tests
COPY scripts/*.ts ./scripts/
COPY scripts/lib ./scripts/lib
COPY scripts/console-seeds ./scripts/console-seeds
ENV NODE_ENV=production GEMUKORE_STANDALONE=1
# No database, storage, OAuth credentials or private environment files are
# supplied to the build. They are injected when the containers are started.
RUN pnpm build

FROM dependencies AS operations
# Operator commands use the pinned pnpm and Node; exclude unused base-image CLIs.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /opt/yarn* /usr/local/bin/yarn*
ENV NODE_ENV=production
COPY package.json prisma.config.ts tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
COPY scripts/access-admin.ts scripts/check-database.ts ./scripts/
COPY docker/app/migrate.mjs ./docker/app/migrate.mjs
COPY docker/garage/setup.mjs ./docker/garage/setup.mjs
COPY --from=build /app/src/server/db/generated ./src/server/db/generated
USER node
ENTRYPOINT ["pnpm"]
CMD ["db:status"]

FROM base AS runtime
# The web server needs Node only. Keep package-manager CLIs and their vulnerable
# dependency trees in the build/operations stages, outside the exposed image.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /opt/yarn* /usr/local/bin/yarn*
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health',{signal:AbortSignal.timeout(4000)}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
