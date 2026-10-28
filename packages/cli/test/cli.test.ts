import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { execFile } from "node:child_process"
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { version } from "../package.json"
import type { Capture } from "../src/contract"

const exec = promisify(execFile)
const binary = path.resolve(import.meta.dir, "../dist/sniptide.js")
let root: string
let source: string
let target: string
let server: ReturnType<typeof Bun.serve> | undefined
let baseUrl: string
let requests: { url: URL; body: unknown; auth: string | null }[]
let handler: (request: Request) => Response | Promise<Response>

const component = {
  name: "src/components/Button.tsx",
  language: "typescript",
  content: "export const Button = () => <button>Go</button>\n",
}
const sample: Capture = {
  title: "Button",
  description: "Reusable button",
  visibility: "private",
  collection: null,
  tags: ["ui"],
  source: null,
  files: [component],
}
const saved = { ...sample, id: "paste-1", slug: "button-1" }

beforeAll(async () => {
  await exec("bun", ["run", "build"], { cwd: path.resolve(import.meta.dir, "..") })
})
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "sniptide-cli-"))
  source = path.join(root, "source")
  target = path.join(root, "target")
  await mkdir(source)
  await mkdir(target)
  requests = []
  handler = () => Response.json({ paste: saved })
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (req) => {
      requests.push({
        url: new URL(req.url),
        body: req.method === "POST" || req.method === "PUT" ? await req.clone().json() : null,
        auth: req.headers.get("authorization"),
      })
      return handler(req)
    },
  })
  baseUrl = server.url.href.replace(/\/$/, "")
})
afterEach(async () => {
  server?.stop(true)
  await rm(root, { recursive: true, force: true })
})

async function cli(args: string[], cwd = source, override: NodeJS.ProcessEnv = {}, input?: string) {
  const env = {
    ...process.env,
    SNIPTIDE_CONFIG: path.join(root, "config", "config.json"),
    SNIPTIDE_BASE_URL: baseUrl,
    SNIPTIDE_TOKEN: "test-token",
    ...override,
  }
  try {
    const execution = exec("node", [binary, ...args], { cwd, env })
    execution.child.stdin?.end(input)
    const result = await execution
    return { ...result, code: 0 }
  } catch (error) {
    const result = error as Error & { stdout: string; stderr: string; code: number }
    return { stdout: result.stdout, stderr: result.stderr, code: result.code }
  }
}
async function fixture(name = component.name as string, content = component.content as string) {
  const filename = path.join(source, name)
  await mkdir(path.dirname(filename), { recursive: true })
  await writeFile(filename, content)
}
async function localBundle(pastes: Capture[]) {
  const filename = path.join(root, "bundle.json")
  await writeFile(filename, JSON.stringify({ version: 1, pastes }))
  return filename
}

describe("built Node CLI", () => {
  test("prints help and version without configuration or credentials", async () => {
    expect((await cli(["--version", "--json"], source, { SNIPTIDE_TOKEN: "" })).stdout).toBe(
      `${JSON.stringify({ ok: true, data: { version } })}\n`,
    )
    const result = await cli(["--help"])
    expect(result.code).toBe(0)
    expect(result.stdout).toContain("sniptide push")
    expect(requests).toHaveLength(0)
  })

  test("exports a component tree in one command and restores it in one command", async () => {
    await fixture()
    await fixture("src/components/Button.css", ".button { color: red; }\n")
    const pushed = await cli(
      [
        "push",
        "src/components",
        "--title",
        "Button",
        "--tag",
        "ui",
        "--output",
        "capture.json",
        "--json",
      ],
      source,
      { SNIPTIDE_TOKEN: "" },
    )
    expect(pushed.code).toBe(0)
    const manifest = JSON.parse(await readFile(path.join(source, "capture.json"), "utf8"))
    expect(manifest.pastes[0].files.map((file: { name: string }) => file.name)).toEqual([
      "src/components/Button.css",
      "src/components/Button.tsx",
    ])
    expect(manifest.pastes[0].visibility).toBe("private")
    expect(manifest.pastes[0].tags).toEqual(["ui"])
    const pulled = await cli(
      ["pull", "--input", path.join(source, "capture.json"), "--json"],
      target,
      { SNIPTIDE_TOKEN: "" },
    )
    expect(pulled.code).toBe(0)
    expect(await readFile(path.join(target, "src/components/Button.tsx"), "utf8")).toBe(
      component.content,
    )
    expect(await readFile(path.join(target, "src/components/Button.css"), "utf8")).toBe(
      ".button { color: red; }\n",
    )
    expect(requests).toHaveLength(0)
  })

  test("pushes globs with bearer auth, inferred languages, tags, and collection", async () => {
    await fixture()
    const result = await cli([
      "push",
      "src/**/*.tsx",
      "--title",
      "Button",
      "--collection",
      "ui",
      "--tag",
      "react",
      "--json",
    ])
    expect(result.code).toBe(0)
    expect(requests[0]?.url.pathname).toBe("/api/v1/pastes")
    expect(requests[0]?.auth).toBe("Bearer test-token")
    expect(requests[0]?.body).toMatchObject({
      title: "Button",
      collection: "ui",
      tags: ["react"],
      files: sample.files,
    })
    expect(JSON.parse(result.stdout).data.id).toBe("paste-1")
  })

  test("captures inclusive line selections without changing line endings", async () => {
    await fixture("src/query.sql", "first\r\nsecond\r\nthird")
    const result = await cli(["push", "src/query.sql", "--lines", "2:3", "--dry-run", "--json"])
    expect(result.code).toBe(0)
    expect(JSON.parse(result.stdout).data.files[0]).toEqual({
      name: "src/query.sql",
      language: "sql",
      content: "second\r\nthird",
      lines: { start: 2, end: 3 },
    })
    expect(requests).toHaveLength(0)
    expect((await cli(["push", "src/query.sql", "--lines", "1:4", "--dry-run"])).code).toBe(2)
  })

  test("captures commit, sanitized remote, and dirty state", async () => {
    await fixture()
    await exec("git", ["init", "-q"], { cwd: source })
    await exec("git", ["add", "."], { cwd: source })
    await exec(
      "git",
      [
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.com",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "-qm",
        "test: add fixture",
      ],
      { cwd: source },
    )
    await exec(
      "git",
      ["remote", "add", "origin", "https://user:secret@example.com/team/repo.git?token=secret"],
      { cwd: source },
    )
    let result = await cli(["push", "src", "--dry-run", "--json"])
    expect(JSON.parse(result.stdout).data.source).toMatchObject({
      repository: "https://example.com/team/repo.git",
      dirty: false,
    })
    expect(JSON.parse(result.stdout).data.source.commit).toMatch(/^[a-f0-9]{40}$/)
    await fixture(undefined, "changed\n")
    result = await cli(["push", "src", "--dry-run", "--json"])
    expect(JSON.parse(result.stdout).data.source.dirty).toBe(true)
    expect(result.stdout).not.toContain("secret")
  })

  test("skips ignored files and environment secrets, and deduplicates overlapping globs", async () => {
    await fixture()
    await fixture(".env", "TOKEN=secret")
    await fixture("ignored.ts", "ignore me")
    await fixture(".gitignore", "ignored.ts\n")
    await exec("git", ["init", "-q"], { cwd: source })
    const result = await cli([
      "push",
      "**/*.tsx",
      "src/components/Button.tsx",
      "--dry-run",
      "--json",
    ])
    expect(JSON.parse(result.stdout).data.files).toHaveLength(1)
    expect((await cli(["push", ".env", "--dry-run"])).code).toBe(2)
    expect((await cli(["push", "ignored.ts", "--dry-run"])).code).toBe(2)
    expect(requests).toHaveLength(0)
  })

  test("rejects binary, oversized, empty, and unmatched captures", async () => {
    await fixture("binary.txt", "hello\0world")
    await fixture("large.txt", "x".repeat(1024 * 1024 + 1))
    await fixture("empty.txt", " ")
    for (const name of ["binary.txt", "large.txt", "empty.txt", "nothing*.tsx"]) {
      expect((await cli(["push", name, "--dry-run"])).code).toBe(2)
    }
    expect(requests).toHaveLength(0)
  })

  test("batches ignore checks and reuses overlapping selections", async () => {
    await exec("git", ["init", "-q"], { cwd: source })
    await fixture(".gitignore", "src/ignored-*.ts\n")
    for (let index = 0; index < 64; index++) await fixture(`src/ignored-${index}.ts`, "ignored")
    await fixture("src/with space.ts", "export {}")
    const trace = path.join(root, "git-trace.log")
    const result = await cli(
      ["push", "src/**/*.ts", "src/with space.ts", "--dry-run", "--json"],
      source,
      { GIT_TRACE: trace },
    )
    expect(result.code).toBe(0)
    expect(JSON.parse(result.stdout).data.files.map((file: { name: string }) => file.name)).toEqual(
      ["src/with space.ts"],
    )
    const checks = (await readFile(trace, "utf8"))
      .split("\n")
      .filter((line) => line.includes("built-in: git check-ignore"))
    expect(checks).toHaveLength(1)
  })

  test("captures files when Git closes its input pipe early", async () => {
    await fixture()
    const preload = path.join(root, "closed-git-stdin.cjs")
    const trace = path.join(root, "closed-git-stdin.log")
    await writeFile(
      preload,
      `const childProcess = require("node:child_process")
const { promisify } = require("node:util")
const { syncBuiltinESMExports } = require("node:module")
const { writeFileSync } = require("node:fs")
const original = childProcess.execFile
const execute = promisify(original)
const execFile = (...args) => original(...args)
execFile[promisify.custom] = (...args) => {
  const execution = execute(...args)
  if (args[0] === "git" && args[1][0] === "check-ignore") {
    const input = execution.child.stdin
    input.end = () => {
      writeFileSync(${JSON.stringify(trace)}, "EPIPE")
      process.nextTick(() => input.destroy(Object.assign(new Error("write EPIPE"), { code: "EPIPE" })))
      return input
    }
  }
  return execution
}
childProcess.execFile = execFile
syncBuiltinESMExports()
`,
    )
    const result = await cli(["push", component.name, "--dry-run", "--json"], source, {
      NODE_OPTIONS: `--require=${JSON.stringify(preload)}`,
    })
    expect(await readFile(trace, "utf8")).toBe("EPIPE")
    expect(result.stderr).not.toContain("Unhandled 'error' event")
    expect(result.code).toBe(0)
    expect(JSON.parse(result.stdout).data.files).toEqual([component])
    expect(requests).toHaveLength(0)
  })

  test("rejects symlink capture and paths outside the source root", async () => {
    await writeFile(path.join(root, "outside.ts"), "outside")
    await symlink(path.join(root, "outside.ts"), path.join(source, "link.ts"))
    await symlink(root, path.join(source, "linked"))
    for (const name of [
      "link.ts",
      "linked/outside.ts",
      "../outside.ts",
      path.join(root, "outside.ts"),
    ]) {
      expect((await cli(["push", name, "--dry-run"])).code).toBe(2)
    }
  })

  test("pulls a paste without dropping its folder structure", async () => {
    const result = await cli(["pull", "paste-1", "--json"], target)
    expect(result.code).toBe(0)
    expect(requests[0]?.url.pathname).toBe("/api/v1/pastes/paste-1")
    expect(await readFile(path.join(target, component.name as string), "utf8")).toBe(
      component.content,
    )
  })

  test("fetches an ordered collection across pages before writing", async () => {
    handler = (req) => {
      const cursor = new URL(req.url).searchParams.get("cursor")
      return Response.json({
        pastes: [
          cursor
            ? {
                ...saved,
                id: "paste-2",
                files: [{ name: "src/styles.css", language: "text", content: "body {}" }],
              }
            : saved,
        ],
        nextCursor: cursor ? null : "page-2",
      })
    }
    const result = await cli(["pull", "collection:ui", "--json"], target)
    expect(result.code).toBe(0)
    expect(requests.map((req) => req.url.pathname)).toEqual([
      "/api/v1/collections/ui/pastes",
      "/api/v1/collections/ui/pastes",
    ])
    expect(JSON.parse(result.stdout).data.files).toEqual([
      "src/components/Button.tsx",
      "src/styles.css",
    ])
  })

  test("refuses collection pagination loops without writing", async () => {
    handler = () => Response.json({ pastes: [saved], nextCursor: "repeat" })
    const result = await cli(["pull", "collection:ui", "--json"], target)
    expect(result.code).toBe(1)
    expect(JSON.parse(result.stderr).error.code).toBe("INVALID_RESPONSE")
    expect(await lstat(path.join(target, "src")).catch(() => null)).toBeNull()
  })

  test("installs a collection as a skill with its snippets beside SKILL.md", async () => {
    handler = (req) =>
      new URL(req.url).pathname.endsWith("/collections")
        ? Response.json({ collections: [{ slug: "ui", name: "UI <kit>", pasteCount: 1 }] })
        : Response.json({ pastes: [saved], nextCursor: null })
    const result = await cli(["skill", "collection:ui", "--json"], target)
    expect(result.code).toBe(0)
    const skill = path.join(target, ".claude/skills/ui")
    expect(JSON.parse(result.stdout).data).toEqual({
      name: "ui",
      directory: skill,
      files: ["SKILL.md", "snippets/button-1/src/components/Button.tsx"],
      dryRun: false,
    })
    const text = await readFile(path.join(skill, "SKILL.md"), "utf8")
    expect(text).toStartWith(
      '---\nname: ui\ndescription: "Code snippets from the Sniptide collection UI kit: Button.',
    )
    expect(text).toContain(
      "## Button\n\nReusable button\n\nTags: ui.\n\n- [src/components/Button.tsx]",
    )
    expect(
      await readFile(path.join(skill, "snippets/button-1/src/components/Button.tsx"), "utf8"),
    ).toBe(component.content)
    expect((await cli(["skill", "ui"], target)).code).not.toBe(0)
    expect((await cli(["skill", "ui", "--force"], target)).code).toBe(0)
  })

  test("skill picks the agent folder and name, and dry-run writes nothing", async () => {
    handler = (req) =>
      new URL(req.url).pathname.endsWith("/collections")
        ? Response.json({ collections: [] })
        : Response.json({ pastes: [saved], nextCursor: null })
    const result = await cli(
      ["skill", "ui", "--agent", "cursor", "--name", "Our UI!", "--dry-run", "--json"],
      target,
    )
    expect(result.code).toBe(0)
    expect(JSON.parse(result.stdout).data.directory).toBe(
      path.join(target, ".cursor/skills/our-ui"),
    )
    expect(await lstat(path.join(target, ".cursor")).catch(() => null)).toBeNull()
    const wrong = await cli(["skill", "ui", "--agent", "vim", "--json"], target)
    expect(JSON.parse(wrong.stderr).error.message).toContain("--agent")
    handler = () => Response.json({ pastes: [], nextCursor: null })
    const empty = await cli(["skill", "ui", "--json"], target)
    expect(JSON.parse(empty.stderr).error.message).toContain("no pastes")
  })

  test("preflights conflicts before writing and only overwrites with --force", async () => {
    await writeFile(path.join(target, "existing.ts"), "local code")
    const input = await localBundle([
      {
        ...sample,
        files: [
          { name: "first.ts", language: "typescript", content: "first" },
          { name: "existing.ts", language: "typescript", content: "incoming" },
        ],
      },
    ])
    expect((await cli(["pull", "--input", input], target)).code).toBe(2)
    expect(await lstat(path.join(target, "first.ts")).catch(() => null)).toBeNull()
    expect(await readFile(path.join(target, "existing.ts"), "utf8")).toBe("local code")
    expect((await cli(["pull", "--input", input, "--force"], target)).code).toBe(0)
    expect(await readFile(path.join(target, "existing.ts"), "utf8")).toBe("incoming")
  })

  test("rejects malicious, duplicate, case-colliding, and folder-conflicting output paths", async () => {
    for (const names of [
      ["../escape.ts"],
      ["/absolute.ts"],
      ["C:/escape.ts"],
      ["src\\escape.ts"],
      [".git/config"],
      [".env"],
      ["NUL.txt"],
      ["a.ts", "a.ts"],
      ["A.ts", "a.ts"],
      ["src", "src/a.ts"],
    ]) {
      const input = await localBundle([
        { ...sample, files: names.map((name) => ({ name, language: "text", content: "code" })) },
      ])
      const result = await cli(["pull", "--input", input, "--force"], target)
      expect(result.code).toBe(2)
    }
    expect(await lstat(path.join(root, "escape.ts")).catch(() => null)).toBeNull()
  })

  test("rejects symlink output even when forced", async () => {
    const outside = path.join(root, "outside")
    await mkdir(outside)
    await symlink(outside, path.join(target, "src"))
    const input = await localBundle([sample])
    expect((await cli(["pull", "--input", input, "--force"], target)).code).toBe(2)
    expect(await lstat(path.join(outside, "components")).catch(() => null)).toBeNull()
  })

  test("dry-run pull creates no output directory", async () => {
    const input = await localBundle([sample])
    const dir = path.join(target, "new")
    const result = await cli(
      ["pull", "--input", input, "--dir", dir, "--dry-run", "--json"],
      target,
    )
    expect(result.code).toBe(0)
    expect(JSON.parse(result.stdout).data.dryRun).toBe(true)
    expect(await lstat(dir).catch(() => null)).toBeNull()
  })

  test("search and list send filters with correct encoding and preserve pagination", async () => {
    handler = () =>
      Response.json({
        pastes: [{ id: "paste-1", title: "Button", languages: ["typescript"], tags: ["ui"] }],
        nextCursor: "next page",
      })
    const result = await cli([
      "search",
      "button & form",
      "--tag",
      "ui",
      "--tag",
      "react",
      "--language",
      "typescript",
      "--collection",
      "my ui",
      "--cursor",
      "cursor +/",
      "--limit",
      "5",
      "--json",
    ])
    expect(result.code).toBe(0)
    const query = requests[0]?.url.searchParams
    expect(query?.get("q")).toBe("button & form")
    expect(query?.getAll("tag")).toEqual(["ui", "react"])
    expect(query?.get("collection")).toBe("my ui")
    expect(query?.get("cursor")).toBe("cursor +/")
    expect(JSON.parse(result.stdout).data.nextCursor).toBe("next page")
    expect((await cli(["list", "--limit", "101"])).code).toBe(2)
  })

  test("reports auth and network failures as JSON errors with stable exit statuses", async () => {
    let result = await cli(["list", "--json"], source, { SNIPTIDE_TOKEN: "" })
    expect(result.code).toBe(3)
    expect(JSON.parse(result.stderr).error.code).toBe("AUTH_REQUIRED")
    expect(requests).toHaveLength(0)
    for (const [status, code, exit] of [
      [401, "UNAUTHORIZED", 3],
      [403, "FORBIDDEN", 3],
      [404, "NOT_FOUND", 1],
      [429, "API_ERROR", 1],
    ] as const) {
      handler = () =>
        new Response("test-token must not be echoed", { status, headers: { "Retry-After": "5" } })
      result = await cli(["list", "--json"])
      expect(result.code).toBe(exit)
      expect(JSON.parse(result.stderr).error.code).toBe(code)
      expect(result.stderr).not.toContain("test-token")
    }
    server?.stop(true)
    result = await cli(["list", "--json"])
    expect(JSON.parse(result.stderr).error.code).toBe("NETWORK_ERROR")
  })

  test("does not follow redirects or echo non-JSON responses", async () => {
    handler = () =>
      new Response(null, { status: 302, headers: { Location: "https://example.com" } })
    expect(JSON.parse((await cli(["list", "--json"])).stderr).error.code).toBe("REDIRECT")
    handler = () => new Response("test-token")
    const result = await cli(["list", "--json"])
    expect(JSON.parse(result.stderr).error.code).toBe("INVALID_RESPONSE")
    expect(result.stderr).not.toContain("test-token")
  })

  test("validates login before saving credentials and isolates tokens by instance", async () => {
    handler = () => Response.json({ user: { id: "user-1" }, scopes: ["read", "write"] })
    const result = await cli(["login", "--json"])
    expect(result.code).toBe(0)
    expect(result.stdout).not.toContain("test-token")
    const filename = path.join(root, "config", "config.json")
    expect((await lstat(filename)).mode & 0o777).toBe(0o600)
    const config = JSON.parse(await readFile(filename, "utf8"))
    expect(config.token).toBe("test-token")
    const other = await cli(["list", "--base-url", "https://example.com", "--json"], source, {
      SNIPTIDE_TOKEN: "",
    })
    expect(other.code).toBe(3)
    expect(requests).toHaveLength(1)
    expect((await cli(["logout"])).code).toBe(0)
    expect(await lstat(filename).catch(() => null)).toBeNull()
  })

  test("invalid login does not persist a token", async () => {
    handler = () => new Response(null, { status: 401 })
    expect((await cli(["login"])).code).toBe(3)
    expect(await lstat(path.join(root, "config", "config.json")).catch(() => null)).toBeNull()
  })

  test("validates unsupported options, input sources, and insecure remote URLs", async () => {
    for (const args of [
      ["push", "--input", "file"],
      ["pull", "paste", "--input", "file"],
      ["search"],
      ["list", "--base-url", "http://example.com"],
      ["list", "--base-url", "https://user:secret@example.com"],
      ["env", "pull"],
    ]) {
      const result = await cli([...args, "--json"])
      expect(result.code).not.toBe(0)
      expect(JSON.parse(result.stderr).ok).toBe(false)
    }
    expect(requests).toHaveLength(0)
  })
})

test("round-trips code through a contract server between two projects", async () => {
  await fixture()
  await fixture("src/hooks/use-button.ts", "export const useButton = () => true\n")
  let stored: Capture | undefined
  handler = async (req) => {
    if (req.method === "POST") stored = (await req.json()) as Capture
    return Response.json({ paste: { ...stored, id: "roundtrip", slug: "roundtrip" } })
  }
  const pushed = await cli(["push", "src", "--title", "Button and hook", "--json"])
  expect(pushed.code).toBe(0)
  const id = JSON.parse(pushed.stdout).data.id
  const pulled = await cli(["pull", id, "--json"], target)
  expect(pulled.code).toBe(0)
  expect(await readFile(path.join(target, component.name), "utf8")).toBe(component.content)
  expect(await readFile(path.join(target, "src/hooks/use-button.ts"), "utf8")).toBe(
    "export const useButton = () => true\n",
  )
  expect(requests).toHaveLength(2)
})

test("reads login tokens from stdin and reuses saved credentials", async () => {
  handler = (req) =>
    new URL(req.url).pathname.endsWith("/me")
      ? Response.json({ user: { id: "user-1" } })
      : Response.json({ pastes: [], nextCursor: null })
  expect(
    (
      await cli(
        ["login", "--token-stdin", "--json"],
        source,
        { SNIPTIDE_TOKEN: "" },
        "piped-token\n",
      )
    ).code,
  ).toBe(0)
  expect((await cli(["list", "--json"], source, { SNIPTIDE_TOKEN: "" })).code).toBe(0)
  expect(requests.map((request) => request.auth)).toEqual([
    "Bearer piped-token",
    "Bearer piped-token",
  ])
})

test("supports self-hosted instances under a URL path prefix", async () => {
  handler = () => Response.json({ pastes: [], nextCursor: null })
  const result = await cli(["list", "--base-url", `${baseUrl}/sniptide/`, "--json"])
  expect(result.code).toBe(0)
  expect(requests[0]?.url.pathname).toBe("/sniptide/api/v1/pastes")
})

test("limits response bodies before parsing JSON", async () => {
  handler = () => new Response("x".repeat(25 * 1024 * 1024 + 1))
  const result = await cli(["list", "--json"])
  expect(result.code).toBe(1)
  expect(JSON.parse(result.stderr).error.code).toBe("RESPONSE_TOO_LARGE")
})

describe("env sync", () => {
  const variables = [
    { name: "DATABASE_URL", value: "postgres://app:hunter2@db/app" },
    { name: "GREETING", value: "hello world" },
    { name: "MULTI", value: "one\ntwo" },
  ]
  let group: { slug: string; variables: typeof variables } | null
  beforeEach(() => {
    group = null
    handler = async (req) => {
      const url = new URL(req.url)
      if (url.pathname === "/api/v1/env")
        return Response.json({ groups: group ? [{ slug: group.slug, variables: 3 }] : [] })
      const slug = url.pathname.split("/").pop() ?? ""
      if (req.method === "PUT") {
        group = {
          slug,
          variables: ((await req.json()) as { variables: typeof variables }).variables,
        }
        return Response.json({ group: { ...group, updatedAt: "2026-10-13T00:00:00.000Z" } })
      }
      if (req.method === "DELETE") {
        group = null
        return Response.json({ ok: true })
      }
      return group
        ? Response.json({ group: { ...group, updatedAt: "2026-10-13T00:00:00.000Z" } })
        : Response.json({ ok: false, error: "No env group" }, { status: 404 })
    }
  })

  test("push parses .env and replaces the group, never printing values", async () => {
    await writeFile(
      path.join(source, ".env"),
      '# comment\nexport DATABASE_URL=postgres://app:hunter2@db/app\nGREETING="hello world" # hi\nMULTI="one\\ntwo"\n',
    )
    const dry = await cli(["env", "push", "my-app", "--dry-run", "--json"])
    expect(dry.code).toBe(0)
    expect(requests).toHaveLength(0)
    expect(dry.stdout).not.toContain("hunter2")

    const pushed = await cli(["env", "push", "my-app", "--json"])
    expect(pushed.code).toBe(0)
    expect(JSON.parse(pushed.stdout).data).toEqual({
      group: "my-app",
      variables: ["DATABASE_URL", "GREETING", "MULTI"],
    })
    expect(pushed.stdout).not.toContain("hunter2")
    expect(requests[0]?.url.pathname).toBe("/api/v1/env/my-app")
    expect(requests[0]?.body).toEqual({ variables })
    expect(requests[0]?.auth).toBe("Bearer test-token")
  })

  test("pull writes an owner-only .env that reads back the same, and won't overwrite", async () => {
    group = { slug: "my-app", variables }
    const pulled = await cli(["env", "pull", "my-app", "--json"], target)
    expect(pulled.code).toBe(0)
    expect(pulled.stdout).not.toContain("hunter2")
    const filename = path.join(target, ".env")
    expect((await lstat(filename)).mode & 0o777).toBe(0o600)
    await writeFile(path.join(source, ".env"), await readFile(filename, "utf8"))
    await cli(["env", "push", "copy"])
    expect(requests.at(-1)?.body).toEqual({ variables })

    const again = await cli(["env", "pull", "my-app", "--json"], target)
    expect(again.code).toBe(2)
    expect(JSON.parse(again.stderr).error.code).toBe("PATH_CONFLICT")
    expect((await cli(["env", "pull", "my-app", "--force"], target)).code).toBe(0)

    const printed = await cli(["env", "pull", "my-app", "--stdout"], target)
    expect(printed.stdout).toBe(
      'DATABASE_URL=postgres://app:hunter2@db/app\nGREETING="hello world"\nMULTI="one\\ntwo"\n',
    )
  })

  test("run injects the group into a command and passes its exit status through", async () => {
    group = { slug: "my-app", variables }
    const script =
      "process.exit(process.env.GREETING === 'hello world' && process.env.MULTI === 'one\\ntwo' && process.env.KEEP === 'yes' ? 7 : 1)"
    const result = await cli(["env", "run", "my-app", "--", "node", "-e", script], source, {
      KEEP: "yes",
    })
    expect(result.code).toBe(7)
    const missing = await cli(["env", "run", "my-app", "--", "no-such-command-sniptide"])
    expect(missing.code).toBe(127)
    expect((await cli(["env", "run", "my-app", "--json"])).code).toBe(2)
  })

  test("list and delete groups, and reject bad group names before any request", async () => {
    group = { slug: "my-app", variables }
    expect((await cli(["env", "list"])).stdout).toBe("my-app\t3 variables\n")
    expect((await cli(["env", "delete", "my-app"])).code).toBe(0)
    expect(requests.at(-1)?.url.pathname).toBe("/api/v1/env/my-app")
    const count = requests.length
    for (const args of [
      ["env", "pull", "Bad Name"],
      ["env", "push", "../x"],
      ["env", "nope", "x"],
      ["env", "push", "x", "--stdout"],
    ])
      expect((await cli([...args, "--json"])).code).toBe(2)
    expect(requests).toHaveLength(count)
  })
})
