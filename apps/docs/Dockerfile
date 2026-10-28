# The Sniptide docs site as a standalone Next.js server, for its own Coolify service (or any
# Docker host). Build from the repository root:
#   docker build -f apps/docs/Dockerfile -t sniptide-docs .
# The Sniptide app has its own Dockerfile at the root; this one only serves the docs.

# Node runs Next (as in development); Bun only installs packages and runs scripts.
FROM node:24-slim AS build
COPY --from=oven/bun:1.3.13 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Install from the manifests first so the dependency layer is cached between content changes.
COPY package.json bun.lock ./
COPY apps/docs/package.json apps/docs/
COPY apps/web/package.json apps/web/
COPY packages/auth/package.json packages/auth/
COPY packages/cli/package.json packages/cli/
COPY packages/contracts/package.json packages/contracts/
COPY packages/mcp/package.json packages/mcp/
COPY packages/sdk/package.json packages/sdk/
COPY packages/db/package.json packages/db/
COPY packages/typescript/package.json packages/typescript/
COPY packages/ui/package.json packages/ui/
RUN bun install --frozen-lockfile

COPY . .
# Where the Sniptide app runs: the nav's "API reference" and "Open Sniptide" links point there.
# The pages are prerendered, so this is read at build time (a Coolify build variable), not at
# start.
ARG APP_URL
ENV APP_URL=$APP_URL
# Where the docs are served (https://docs.sniptide.com by default): canonical links, the sitemap and
# link previews use it.
ARG SITE_URL
ENV SITE_URL=$SITE_URL
RUN bun run --filter docs build

FROM node:24-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# The standalone server and its static assets.
COPY --from=build --chown=node:node /app/apps/docs/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/docs/.next/static ./apps/docs/.next/static
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "apps/docs/server.js"]
