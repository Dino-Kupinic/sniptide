import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dir, "..")

const visibilityList = /\[\s*"public"\s*,\s*"unlisted"\s*,\s*"private"\s*\]/
const headerName = /x-forwarded-for|x-real-ip|cf-connecting-ip/i
const pasteInsert = /\.insert\(\s*paste(?:Table)?\s*\)/
const shareLink = /from\s+["']next\/link["']/
const serverAction = /["']use server["']/

const visibilityAllowed = new Set([
  "apps/web/lib/pastes/types.ts",
  "packages/db/src/schema/pastes.ts",
])
const headerAllowed = new Set([
  "apps/web/lib/client-ip.ts",
  "apps/web/lib/analytics-proxy.ts",
])
const insertAllowed = new Set(["apps/web/lib/pastes/insert.ts"])

function walk(dir: string): string[] {
  const found: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "dist" || name === ".turbo") continue
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) found.push(...walk(full))
    else if (name.endsWith(".ts") || name.endsWith(".tsx")) found.push(full)
  }
  return found
}

function relative(file: string) {
  return path.relative(root, file)
}

function isTest(file: string) {
  return file.startsWith("apps/web/test/")
}

function isShareRoute(file: string) {
  return file.startsWith("apps/web/app/[slug]/")
}

export function problemsIn(file: string, text: string): string[] {
  const problems: string[] = []
  if (visibilityList.test(text) && !visibilityAllowed.has(file) && !isTest(file)) {
    problems.push(`${file} recopies the visibility list. Import VISIBILITIES from apps/web/lib/pastes/types.ts.`)
  }
  if (headerName.test(text) && !headerAllowed.has(file) && !isTest(file)) {
    problems.push(`${file} reads a forwarding header. Use apps/web/lib/client-ip.ts.`)
  }
  if (pasteInsert.test(text) && !insertAllowed.has(file) && !isTest(file)) {
    problems.push(`${file} inserts a paste. Call insertPaste from apps/web/lib/pastes/insert.ts.`)
  }
  if ((isShareRoute(file) || file.includes("share-host")) && (shareLink.test(text) || serverAction.test(text))) {
    problems.push(`${file} uses next/link or a server action on the share host. Use a plain anchor or a route handler.`)
  }
  return problems
}

const extra = process.argv.slice(2).map((file) => path.resolve(root, file))
const files = extra.length > 0 ? extra : walk(root).filter((file) => !relative(file).startsWith("scripts/"))
const problems = files.flatMap((file) => problemsIn(relative(file), readFileSync(file, "utf8")))

if (problems.length > 0) {
  for (const problem of problems) console.error(problem)
  process.exit(1)
}
