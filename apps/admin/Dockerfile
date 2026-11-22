# The Sniptide admin app as a standalone Next.js server, for its own Coolify service (or any Docker
# host). It writes and sends product update emails for a hosted Sniptide instance and isn't part of
# the self-hosted image. Build from the repository root:
#   docker build -f apps/admin/Dockerfile -t sniptide-admin .

# Node runs Next (as in development); Bun only installs packages and runs scripts.
FROM node:24-slim AS build
COPY --from=oven/bun:1.4.4 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Install from the manifests first so the dependency layer is cached between source changes.
COPY package.json bun.lock ./
COPY apps/admin/package.json apps/admin/
COPY apps/docs/package.json apps/docs/
COPY apps/extension/package.json apps/extension/
COPY apps/vscode/package.json apps/vscode/
COPY apps/web/package.json apps/web/
COPY packages/auth/package.json packages/auth/
COPY packages/cli/package.json packages/cli/
COPY packages/contracts/package.json packages/contracts/
COPY packages/mcp/package.json packages/mcp/
COPY packages/oauth-client/package.json packages/oauth-client/
COPY packages/sdk/package.json packages/sdk/
COPY packages/db/package.json packages/db/
COPY packages/email/package.json packages/email/
COPY packages/typescript/package.json packages/typescript/
COPY packages/ui/package.json packages/ui/
RUN bun install --frozen-lockfile

COPY . .
RUN bun run --filter admin build

FROM node:24-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=build --chown=node:node /app/apps/admin/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=build --chown=node:node /app/apps/admin/healthcheck.cjs ./healthcheck.cjs
USER node

EXPOSE 3000
# The sign-in page is the one route that answers without a session.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node /app/healthcheck.cjs

CMD ["node", "apps/admin/server.js"]
