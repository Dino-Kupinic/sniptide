# Sniptide as a standalone Next.js server, for Coolify (or any Docker host).
# Build: docker build -t sniptide .   Run: see README ("Deploy").

# Node runs Next (as in development); Bun only installs packages and runs scripts. Next under
# Bun's own runtime crashes during the build.
FROM node:24-slim AS build
COPY --from=oven/bun:1.3.13 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Install from the manifests first so the dependency layer is cached between code changes.
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/
COPY packages/auth/package.json packages/auth/
COPY packages/db/package.json packages/db/
COPY packages/typescript/package.json packages/typescript/
COPY packages/ui/package.json packages/ui/
RUN bun install --frozen-lockfile

COPY . .
ARG DEPLOYMENT_VERSION
ENV DEPLOYMENT_VERSION=$DEPLOYMENT_VERSION
# A BuildKit secret avoids retaining the stable Server Actions key in image metadata.
# Next embeds the key in the build output; reuse it for independent builds of the same service.
RUN --mount=type=secret,id=server_actions_key \
    if [ -f /run/secrets/server_actions_key ]; then \
      export NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="$(cat /run/secrets/server_actions_key)"; \
    fi; bun run --filter web build

FROM node:24-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    MIGRATIONS_DIR=/app/migrations

# The standalone server, its static assets, the files in public/ (the standalone output leaves
# them out), and the SQL migrations applied on startup.
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
COPY --from=build --chown=node:node /app/packages/db/migrations ./migrations

# Data lives in Postgres: set DATABASE_URL (see docker-compose.yml).
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "apps/web/server.js"]
