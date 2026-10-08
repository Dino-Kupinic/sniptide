import type { Paste, Person, Share } from "./types"

// Seed content for the in-memory store, taken from the Paper screens. Times are relative to
// when the store is created so "2 min ago" stays true in a fresh dev server.

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// Who "your" pastes belong to when a visitor opens them on the public page. Until pastes are
// stored per user, the seeded workspace is presented as @dino's.
export const workspaceOwner: Person = {
  username: "dino",
  name: "Dino Kupinic",
  initials: "DK",
  tone: "foreground",
}

export const people: Record<string, Person> = {
  mara: { username: "mara", name: "Mara Vidal", initials: "MV", tone: "primary" },
  theo: { username: "theo", name: "Theo Brandt", initials: "TB", tone: "foreground" },
  ada: { username: "ada", name: "Ada Okafor", initials: "AO", tone: "muted" },
}

const useDebounce = `import { useEffect, useState } from "react"

/**
 * Returns \`value\` once it has stopped changing for \`delay\` ms.
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}
`

const nginx = `server {
  listen 443 ssl http2;
  server_name app.example.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
`

const stackTrace = `Error: checkout failed with 500
    at createOrder (/app/src/checkout/order.ts:88:11)
    at async POST (/app/src/app/api/checkout/route.ts:24:19)
    at async handler (/app/node_modules/next/dist/server/route.js:112:5)
Caused by: PaymentProviderError: card_declined (request req_8fK2...)
`

const deployment = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: ghcr.io/example/web:1.42.0
          ports:
            - containerPort: 3000
`

const zshrc = `export EDITOR=nvim
export PATH="$HOME/.bun/bin:$PATH"

alias g=git
alias gs="git status -sb"
alias k=kubectl

eval "$(starship init zsh)"
`

const compose = `services:
  db:
    image: postgres:17
    environment:
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
  redis:
    image: redis:7
    ports:
      - "6379:6379"
`

const zodEnv = `import { z } from "zod"

export const env = z
  .object({
    DATABASE_URL: z.url(),
    REDIS_URL: z.url().optional(),
    PORT: z.coerce.number().default(3000),
  })
  .parse(process.env)
`

const rateLimit = `package middleware

import (
	"net/http"

	"golang.org/x/time/rate"
)

func RateLimit(next http.Handler, perSecond float64, burst int) http.Handler {
	limiter := rate.NewLimiter(rate.Limit(perSecond), burst)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !limiter.Allow() {
			http.Error(w, "too many requests", http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}
`

const backup = `#!/usr/bin/env bash
set -euo pipefail

STAMP=$(date +%F)
OUT="/var/backups/pg/app-$STAMP.sql.gz"

pg_dump --no-owner --format=plain "$DATABASE_URL" \\
  | gzip -9 > "$OUT"

# keep the last 14 dumps
ls -1t /var/backups/pg/*.sql.gz | tail -n +15 | xargs -r rm --
echo "backup written to $OUT"
`

const crontab = `# m h dom mon dow command
15 3 * * * /usr/local/bin/backup.sh >> /var/log/pg-backup.log 2>&1
`

// 60 days of daily views: the detail page charts the last 14, the dashboard compares the last
// 7 or 30 days with the period before.
export const VIEW_HISTORY_DAYS = 60

function views(total: number, days = VIEW_HISTORY_DAYS) {
  // A deterministic, gently rising curve that sums to roughly `total`.
  const weights = Array.from({ length: days }, (_, day) => 0.6 + ((day * 7) % 5) / 6 + day / days)
  const sum = weights.reduce((a, b) => a + b, 0)
  return weights.map((weight) => Math.round((weight / sum) * total))
}

interface SeedPaste extends Partial<Paste> {
  slug: string
  title: string
  files: Paste["files"]
}

function paste(now: number, seed: SeedPaste & { updatedAgo: number }): Paste {
  const { updatedAgo, ...rest } = seed
  const updatedAt = now - updatedAgo
  const total = seed.views ?? 0

  return {
    description: "",
    visibility: "unlisted",
    password: null,
    burnAfterRead: false,
    allowRaw: true,
    collection: null,
    owner: null,
    views: total,
    uniqueViews: Math.round(total * 0.67),
    viewsByDay: views(total),
    createdAt: updatedAt - 3 * DAY,
    updatedAt,
    expiresAt: null,
    deletedAt: null,
    revisions: [{ message: "Created", createdAt: updatedAt - 3 * DAY }],
    ...rest,
  }
}

export function seedPastes(now: number): Paste[] {
  return [
    paste(now, {
      slug: "k7Qe2x",
      title: "useDebounce hook",
      files: [{ name: "use-debounce.ts", language: "typescript", content: useDebounce }],
      collection: "api-snippets",
      views: 1204,
      uniqueViews: 812,
      updatedAgo: 2 * MINUTE,
      expiresAt: now + 6 * DAY,
      createdAt: now - 9 * DAY,
      revisions: [
        { message: "Added JSDoc and return type", createdAt: now - 2 * MINUTE },
        { message: "Default delay to 300 ms", createdAt: now - DAY },
        { message: "Created", createdAt: now - 9 * DAY },
      ],
    }),
    paste(now, {
      slug: "9fLm3a",
      title: "nginx reverse proxy",
      files: [{ name: "nginx.conf", language: "nginx", content: nginx }],
      visibility: "public",
      views: 2871,
      updatedAgo: HOUR,
    }),
    paste(now, {
      slug: "Xw81bP",
      title: "checkout-500 stack trace",
      files: [{ name: "trace.log", language: "text", content: stackTrace }],
      visibility: "private",
      burnAfterRead: true,
      updatedAgo: 3 * HOUR,
    }),
    paste(now, {
      slug: "p3Hc7v",
      title: "deployment.yaml",
      files: [{ name: "deployment.yaml", language: "yaml", content: deployment }],
      collection: "k8s-manifests",
      views: 386,
      updatedAgo: DAY,
      expiresAt: now + 14 * HOUR,
    }),
    paste(now, {
      slug: "zR4tq1",
      title: ".zshrc",
      files: [{ name: ".zshrc", language: "shell", content: zshrc }],
      visibility: "private",
      collection: "dotfiles",
      views: 14,
      updatedAgo: 3 * DAY,
    }),
    paste(now, {
      slug: "Lq20Za",
      title: "docker-compose for local dev",
      files: [{ name: "docker-compose.yml", language: "docker", content: compose }],
      visibility: "public",
      views: 942,
      updatedAgo: 4 * DAY,
    }),
    paste(now, {
      slug: "aT9vW3",
      title: "zod env schema",
      files: [{ name: "env.ts", language: "typescript", content: zodEnv }],
      collection: "api-snippets",
      views: 57,
      updatedAgo: 5 * DAY,
      expiresAt: now + 21 * DAY,
    }),
    paste(now, {
      slug: "Hh4mQe",
      title: "one-time invite link",
      files: [
        {
          name: "invite.txt",
          language: "text",
          content: "https://app.example.com/invite/7c1e9a\n",
        },
      ],
      visibility: "private",
      burnAfterRead: true,
      updatedAgo: 6 * DAY,
    }),
    paste(now, {
      slug: "c8Nn1R",
      title: "rate-limit middleware",
      files: [{ name: "ratelimit.go", language: "go", content: rateLimit }],
      collection: "api-snippets",
      views: 210,
      updatedAgo: 7 * DAY,
      expiresAt: now + 60 * DAY,
    }),
    paste(now, {
      slug: "pg-backup",
      title: "Postgres nightly backup",
      description: "Dumps the app database at 03:15 and keeps two weeks of backups.",
      files: [
        { name: "backup.sh", language: "shell", content: backup },
        { name: "crontab", language: "shell", content: crontab },
      ],
      visibility: "private",
      password: "hunter22",
      collection: "dotfiles",
      views: 6,
      updatedAgo: 12 * DAY,
      expiresAt: now + 5 * DAY,
    }),
    // Trash
    paste(now, {
      slug: "wp4Kc2",
      title: "old webpack config",
      files: [
        {
          name: "webpack.config.js",
          language: "javascript",
          content: 'module.exports = {\n  mode: "production",\n}\n',
        },
      ],
      updatedAgo: 40 * DAY,
      deletedAt: now - HOUR,
    }),
    paste(now, {
      slug: "ci9OHd",
      title: "CI cache debug notes",
      files: [
        {
          name: "notes.md",
          language: "markdown",
          content: "# CI cache\n\n- key on bun.lock hash\n- restore before install\n",
        },
      ],
      updatedAgo: 30 * DAY,
      deletedAt: now - 7 * DAY,
    }),
    paste(now, {
      slug: "Ig2sTg",
      title: "k8s ingress (staging)",
      files: [
        {
          name: "ingress.yaml",
          language: "yaml",
          content: "apiVersion: networking.k8s.io/v1\nkind: Ingress\n",
        },
      ],
      updatedAgo: 45 * DAY,
      deletedAt: now - 22 * DAY,
    }),
    paste(now, {
      slug: "sv3rRx",
      title: "regex for semver tags",
      files: [
        {
          name: "semver.txt",
          language: "text",
          content: "^v?(\\d+)\\.(\\d+)\\.(\\d+)(?:-([\\w.]+))?$\n",
        },
      ],
      updatedAgo: 50 * DAY,
      deletedAt: now - 29 * DAY,
    }),
    // Owned by other people and shared with the viewer
    paste(now, {
      slug: "tf8Qa1",
      title: "Terraform module for the edge cache",
      files: [
        {
          name: "main.tf",
          language: "hcl",
          content: 'module "edge_cache" {\n  source = "./modules/cache"\n  ttl    = 3600\n}\n',
        },
      ],
      owner: people.mara as Person,
      views: 31,
      updatedAgo: 20 * MINUTE,
    }),
    paste(now, {
      slug: "Rq0s7D",
      title: "Onboarding SQL: seed demo workspace",
      files: [
        {
          name: "seed.sql",
          language: "sql",
          content: "insert into workspace (name) values ('Demo');\n",
        },
      ],
      owner: people.theo as Person,
      views: 12,
      updatedAgo: 2 * HOUR,
    }),
    paste(now, {
      slug: "Ac5yK2",
      title: "GitHub Actions cache step",
      files: [
        {
          name: "ci.yml",
          language: "yaml",
          content: "- uses: actions/cache@v4\n  with:\n    path: ~/.bun/install/cache\n",
        },
      ],
      owner: people.mara as Person,
      visibility: "public",
      views: 98,
      updatedAgo: DAY,
    }),
    paste(now, {
      slug: "Rd9tL4",
      title: "Redis token bucket",
      files: [
        {
          name: "bucket.ts",
          language: "typescript",
          content: "export async function take(key: string) {\n  // ...\n}\n",
        },
      ],
      owner: people.theo as Person,
      views: 44,
      updatedAgo: 4 * DAY,
    }),
    paste(now, {
      slug: "py7Lru",
      title: "Interview: LRU cache in Python",
      files: [
        {
          name: "lru.py",
          language: "python",
          content: "from collections import OrderedDict\n\nclass LRU(OrderedDict):\n    pass\n",
        },
      ],
      owner: people.ada as Person,
      views: 7,
      updatedAgo: 7 * DAY,
    }),
  ]
}

export function seedShares(now: number): (Share & { seen: boolean })[] {
  return [
    { slug: "tf8Qa1", access: "edit", sharedAt: now - 20 * MINUTE, seen: false },
    { slug: "Rq0s7D", access: "view", sharedAt: now - 2 * HOUR, seen: false },
    { slug: "Ac5yK2", access: "view", sharedAt: now - DAY, seen: true },
    { slug: "Rd9tL4", access: "edit", sharedAt: now - 4 * DAY, seen: true },
    { slug: "py7Lru", access: "view", sharedAt: now - 7 * DAY, seen: true },
  ]
}

export const seedStarred = ["k7Qe2x", "p3Hc7v", "aT9vW3", "c8Nn1R", "tf8Qa1", "Rq0s7D"]
