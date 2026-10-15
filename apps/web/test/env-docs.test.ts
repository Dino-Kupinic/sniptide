import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

// Every environment variable the app reads must be listed in apps/web/.env.example with its
// default, and every variable the compose file hands to the app must be listed in the root
// .env.example, so self-hosters never have to read the source to find an option.

const root = join(import.meta.dir, "..", "..", "..")
const SOURCE_DIRS = [
  "apps/web/app",
  "apps/web/lib",
  "apps/web/components",
  "packages/db/src",
  "packages/auth/src",
]
const SOURCE_FILES = [
  "apps/web/proxy.ts",
  "apps/web/instrumentation.ts",
  "apps/web/instrumentation-node.ts",
]
// Owned by Next.js, the build or the runtime rather than the operator.
const PLATFORM = new Set(["NODE_ENV", "NEXT_RUNTIME", "CI", "NEXT_PHASE"])

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

function variablesRead() {
  const names = new Map<string, string>()
  const files = [
    ...SOURCE_DIRS.flatMap((dir) => sourceFiles(join(root, dir))),
    ...SOURCE_FILES.map((file) => join(root, file)),
  ]
  for (const file of files) {
    const text = readFileSync(file, "utf8")
    const patterns = [
      /process\.env\.([A-Z][A-Z0-9_]+)/g,
      /envInteger\(\s*"([A-Z][A-Z0-9_]+)"/g,
      /^\s{2}([A-Z][A-Z0-9_]+): [a-z.]*(?:z\.|origin|size|flag)/gm,
    ]
    // lib/config.ts declares its schema keys as `NAME: z.…`; client-ip.ts destructures process.env.
    for (const [, list] of text.matchAll(/const \{([^}]+)\} = process\.env/g)) {
      for (const name of list?.split(",") ?? []) {
        const trimmed = name.trim()
        if (/^[A-Z][A-Z0-9_]+$/.test(trimmed) && !PLATFORM.has(trimmed)) {
          names.set(trimmed, relative(root, file))
        }
      }
    }
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const name = match[1]
        if (name && !PLATFORM.has(name)) names.set(name, relative(root, file))
      }
    }
  }
  return names
}

function documented(path: string) {
  const text = readFileSync(join(root, path), "utf8")
  return new Set([...text.matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((match) => match[1]))
}

describe("environment documentation", () => {
  test("apps/web/.env.example lists every variable the app reads", () => {
    const listed = documented("apps/web/.env.example")
    // Guards the scan itself: if it stops finding variables, the check below would pass vacuously.
    expect(variablesRead().size).toBeGreaterThan(30)
    const missing = [...variablesRead()].filter(([name]) => !listed.has(name))
    expect(missing.map(([name, file]) => `${name} (${file})`)).toEqual([])
  })

  test("the root .env.example lists every variable the compose file reads from the host", () => {
    const compose = readFileSync(join(root, "docker-compose.yml"), "utf8")
    const used = [...compose.matchAll(/\$\{([A-Z][A-Z0-9_]+)[:?-]/g)].map((match) => match[1])
    const listed = documented(".env.example")
    expect(used.filter((name) => !listed.has(name))).toEqual([])
  })
})
