import type { Visibility } from "@/lib/pastes/types"

// The example data a demo instance starts with and returns to on every reset. Slugs are fixed so
// links to the examples keep working across resets.

export interface DemoFile {
  name: string
  language: string
  content: string
}

export interface DemoPaste {
  slug: string
  title: string
  description: string
  visibility: Visibility
  collection: string | null
  tags: string[]
  files: DemoFile[]
  // How long ago it was made, in hours.
  ageHours: number
  views: number
  uniqueViews: number
  starred?: boolean
  // Days from the seed until it expires, for pastes that show off expiry.
  expiresInDays?: number
}

export const DEMO_COLLECTIONS = [
  { slug: "snippets", name: "Snippets", icon: "grid", hue: "blue" },
  { slug: "configs", name: "Configs", icon: "bars", hue: "teal" },
  { slug: "incidents", name: "Incidents", icon: "target", hue: "orange" },
] as const

export const DEMO_PASTES: DemoPaste[] = [
  {
    slug: "demo-debounce",
    title: "Debounce hook for React",
    description: "A tiny useDebouncedValue hook with a typed generic.",
    visibility: "public",
    collection: "snippets",
    tags: ["react", "hooks"],
    ageHours: 30 * 24,
    views: 482,
    uniqueViews: 311,
    starred: true,
    files: [
      {
        name: "use-debounced-value.ts",
        language: "typescript",
        content: `import { useEffect, useState } from "react"

// Returns \`value\`, but only after it has stopped changing for \`delay\` milliseconds.
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
`,
      },
      {
        name: "example.tsx",
        language: "typescript",
        content: `export function Search() {
  const [query, setQuery] = useState("")
  const debounced = useDebouncedValue(query)
  const results = useSearch(debounced)

  return <input value={query} onChange={(event) => setQuery(event.target.value)} />
}
`,
      },
    ],
  },
  {
    slug: "demo-paginate",
    title: "Keyset pagination in Postgres",
    description: "Page through a big table without OFFSET getting slower.",
    visibility: "public",
    collection: "snippets",
    tags: ["postgres", "sql"],
    ageHours: 12 * 24,
    views: 1204,
    uniqueViews: 876,
    starred: true,
    files: [
      {
        name: "page.sql",
        language: "sql",
        content: `-- Page 1
SELECT id, title, created_at
FROM paste
ORDER BY created_at DESC, id DESC
LIMIT 20;

-- The next page: pass the last row's values back in.
SELECT id, title, created_at
FROM paste
WHERE (created_at, id) < ($1, $2)
ORDER BY created_at DESC, id DESC
LIMIT 20;
`,
      },
    ],
  },
  {
    slug: "demo-retry",
    title: "Retry with exponential backoff",
    description: "Wraps any async call. Gives up after a few tries.",
    visibility: "unlisted",
    collection: "snippets",
    tags: ["typescript", "network"],
    ageHours: 6 * 24,
    views: 97,
    uniqueViews: 64,
    files: [
      {
        name: "retry.ts",
        language: "typescript",
        content: `export async function retry<T>(
  run: () => Promise<T>,
  { tries = 4, baseMs = 200 }: { tries?: number; baseMs?: number } = {},
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return await run()
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, baseMs * 2 ** attempt))
    }
  }
  throw lastError
}
`,
      },
    ],
  },
  {
    slug: "demo-compose",
    title: "docker-compose for a Node app + Postgres",
    description: "Healthcheck-gated startup so the app waits for the database.",
    visibility: "public",
    collection: "configs",
    tags: ["docker", "postgres"],
    ageHours: 20 * 24,
    views: 733,
    uniqueViews: 540,
    files: [
      {
        name: "docker-compose.yml",
        language: "yaml",
        content: `services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_PASSWORD: example
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      retries: 10

  app:
    build: .
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgres://postgres:example@db:5432/postgres
    ports:
      - "3000:3000"
`,
      },
    ],
  },
  {
    slug: "demo-nginx",
    title: "nginx reverse proxy with caching",
    description: "Proxy to an upstream app and cache static assets for a week.",
    visibility: "private",
    collection: "configs",
    tags: ["nginx"],
    ageHours: 9 * 24,
    views: 12,
    uniqueViews: 3,
    files: [
      {
        name: "nginx.conf",
        language: "nginx",
        content: `server {
  listen 80;
  server_name example.com;

  location /static/ {
    proxy_pass http://app:3000;
    proxy_cache static;
    proxy_cache_valid 200 7d;
  }

  location / {
    proxy_pass http://app:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
`,
      },
    ],
  },
  {
    slug: "demo-postmortem",
    title: "Postmortem: elevated 5xx on checkout",
    description: "Timeline and follow-ups. Kept private to the team.",
    visibility: "private",
    collection: "incidents",
    tags: ["postmortem"],
    ageHours: 3 * 24,
    views: 8,
    uniqueViews: 2,
    files: [
      {
        name: "postmortem.md",
        language: "markdown",
        content: `# Elevated 5xx on checkout

**Impact:** about 4% of checkout requests failed for 22 minutes.

## Timeline
- 14:02 A deploy raised the connection pool size from 10 to 40.
- 14:09 Postgres hit its connection limit; new requests started failing.
- 14:24 Rolled back the deploy. Errors stopped.

## Follow-ups
- Alert on connection saturation, not just error rate.
- Size the pool against \`max_connections\` in CI.
`,
      },
    ],
  },
  {
    slug: "demo-scratch",
    title: "Scratch: shell one-liners",
    description: "Expires in a week. Try the expiry options in the editor.",
    visibility: "unlisted",
    collection: null,
    tags: ["shell"],
    ageHours: 5,
    views: 4,
    uniqueViews: 1,
    expiresInDays: 7,
    files: [
      {
        name: "notes.sh",
        language: "shell",
        content: `# Largest files in the current directory
du -ah . | sort -rh | head -n 10

# Who is listening on port 3000?
lsof -i :3000

# Follow the last 100 log lines
tail -n 100 -f app.log
`,
      },
    ],
  },
  {
    slug: "demo-welcome",
    title: "Welcome to the Sniptide demo",
    description: "Start here. Everything in this account is shared and resets regularly.",
    visibility: "public",
    collection: null,
    tags: ["demo"],
    ageHours: 35 * 24,
    views: 2150,
    uniqueViews: 1432,
    starred: true,
    files: [
      {
        name: "welcome.md",
        language: "markdown",
        content: `# Welcome to Sniptide

You're signed in to a shared guest account, so you can try everything without signing up.

- Press **New paste** to share a snippet. Pick when it expires and who can see it.
- Open a paste and check **Analytics** to see how often it was read.
- File pastes into **Collections** and star the ones you want to find again.

Other visitors use this account too, and it resets to this example data on a schedule.
Don't paste anything private here. To keep your own pastes, self-host Sniptide or create an account
on your own instance.
`,
      },
    ],
  },
]
