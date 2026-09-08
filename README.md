# Sniptide

A small Next.js monorepo powered by Bun, Turborepo, Biome, and Drizzle.

## Development

```bash
bun install
bun dev
```

Useful checks:

```bash
bun run build
bun run lint
bun run typecheck
bun run format
```

## Workspace

- `apps/web` — Next.js application
- `packages/db` — Drizzle database package
- `packages/ui` — shared UI components
- `packages/typescript` — shared TypeScript configuration
