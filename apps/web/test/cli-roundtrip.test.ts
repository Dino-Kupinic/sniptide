import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { inspectModeration, transitionModeration } from "@workspace/db/moderation"
import { collection } from "@workspace/db/schema"
import { GET as collectionPastes } from "@/app/api/v1/collections/[slug]/pastes/route"
import { DELETE as deleteEnv, GET as getEnv, PUT as putEnv } from "@/app/api/v1/env/[group]/route"
import { GET as listEnv } from "@/app/api/v1/env/route"
import { GET as me } from "@/app/api/v1/me/route"
import { GET as getPaste } from "@/app/api/v1/pastes/[id]/route"
import { POST as createPaste, GET as listPastes } from "@/app/api/v1/pastes/route"
import { setCollectionSteps } from "@/lib/api/pastes"
import { createToken } from "@/lib/api/tokens"
import { getDb } from "@/lib/db"
import { run } from "../../../packages/cli/src/cli"
import { hasDatabase, resetDatabase, seedPaste, seedUser } from "./harness"

// WRK-115's acceptance check: the real `sniptide` CLI, talking HTTP to the real /api/v1 route
// handlers on the test database, pushes a component with its folder structure from one project
// and pulls it into another with one command each. Env groups make the same trip.

process.env.ENV_SECRETS_KEY = "test-env-secrets-key-that-is-long-enough"

const describeDb = hasDatabase ? describe : describe.skip

type Handler = (request: Request, context: never) => Promise<Response>
const routes: [RegExp, Record<string, Handler>][] = [
  [/^\/api\/v1\/me$/, { GET: me }],
  [/^\/api\/v1\/pastes$/, { GET: listPastes, POST: createPaste }],
  [/^\/api\/v1\/pastes\/(?<id>[^/]+)$/, { GET: getPaste }],
  [/^\/api\/v1\/collections\/(?<slug>[^/]+)\/pastes$/, { GET: collectionPastes }],
  [/^\/api\/v1\/env$/, { GET: listEnv }],
  [/^\/api\/v1\/env\/(?<group>[^/]+)$/, { GET: getEnv, PUT: putEnv, DELETE: deleteEnv }],
]

let server: ReturnType<typeof Bun.serve> | undefined
let root: string
let token: string

async function cli(args: string[], cwd: string) {
  let stdout = ""
  let stderr = ""
  const code = await run([...args, "--json"], {
    cwd,
    env: {
      NODE_ENV: "test",
      PATH: process.env.PATH,
      SNIPTIDE_CONFIG: path.join(root, "config.json"),
      SNIPTIDE_BASE_URL: server?.url.href ?? "",
      SNIPTIDE_TOKEN: token,
    },
    stdout: (text) => {
      stdout += text
    },
    stderr: (text) => {
      stderr += text
    },
    stdin: async () => "",
  })
  return { code, stdout, stderr, data: stdout ? JSON.parse(stdout).data : null }
}

async function write(file: string, content: string) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, content)
}

describeDb("sniptide CLI against the app", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("ada")
    const created = await createToken("ada", { name: "cli", write: true, expiry: "never" })
    if (!created.ok) throw new Error(created.error)
    token = created.token
    root = await mkdtemp(path.join(tmpdir(), "sniptide-roundtrip-"))
    server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: async (request) => {
        const { pathname } = new URL(request.url)
        for (const [pattern, methods] of routes) {
          const match = pattern.exec(pathname)
          const handler = match ? methods[request.method] : undefined
          if (handler)
            return handler(request, { params: Promise.resolve({ ...match?.groups }) } as never)
        }
        return new Response("Not found", { status: 404 })
      },
    })
  })
  afterEach(async () => {
    server?.stop(true)
    await rm(root, { recursive: true, force: true })
  })

  test("push a component tree from one project and pull it into another", async () => {
    const source = path.join(root, "design-system")
    const target = path.join(root, "app")
    await mkdir(target, { recursive: true })
    const files = {
      "src/components/button/button.tsx": "export function Button() {\n  return <button />\n}\n",
      "src/components/button/button.css": ".button { color: blue; }\n",
      "src/components/button/index.ts": 'export * from "./button"\n',
    }
    for (const [name, content] of Object.entries(files))
      await write(path.join(source, name), content)
    await getDb().insert(collection).values({ ownerId: "ada", slug: "ui", name: "UI" })

    expect((await cli(["login"], source)).code).toBe(0)
    const pushed = await cli(
      [
        "push",
        "src/components/button",
        "--title",
        "Button",
        "--tag",
        "react",
        "--collection",
        "ui",
      ],
      source,
    )
    expect(pushed.stderr).toBe("")
    expect(pushed.code).toBe(0)
    expect(pushed.data.visibility).toBe("private")
    expect(pushed.data.files.map((file: { name: string }) => file.name)).toEqual(
      Object.keys(files).sort(),
    )

    const pulled = await cli(["pull", pushed.data.id], target)
    expect(pulled.code).toBe(0)
    for (const [name, content] of Object.entries(files))
      expect(await readFile(path.join(target, name), "utf8")).toBe(content)

    const fromCollection = path.join(root, "other")
    expect((await cli(["pull", "collection:ui", "--dir", fromCollection], root)).code).toBe(0)
    for (const name of Object.keys(files))
      expect(await readFile(path.join(fromCollection, name), "utf8")).toBe(
        files[name as keyof typeof files],
      )

    // A collection pull reports its steps with the owner's instructions.
    await setCollectionSteps("ada", "ui", {
      steps: [{ id: pushed.data.id, instruction: "Copy the button into the app." }],
    })
    const stepped = await cli(["pull", "collection:ui", "--dir", path.join(root, "third")], root)
    expect(stepped.data.steps).toEqual([
      {
        step: 1,
        id: pushed.data.id,
        title: "Button",
        instruction: "Copy the button into the app.",
      },
    ])

    const found = await cli(["search", "butt", "--tag", "react", "--language", "typescript"], root)
    expect(found.data.pastes.map((item: { id: string }) => item.id)).toEqual([pushed.data.id])
  })

  test("sync an env file between projects and run a command with it", async () => {
    const one = path.join(root, "one")
    const two = path.join(root, "two")
    await write(path.join(one, ".env"), 'API_URL=https://api.example.com\nSECRET="s3cr3t value"\n')
    await mkdir(two, { recursive: true })

    expect((await cli(["env", "push", "shop"], one)).data.variables).toEqual(["API_URL", "SECRET"])
    expect((await cli(["env", "pull", "shop"], two)).code).toBe(0)
    expect(await readFile(path.join(two, ".env"), "utf8")).toBe(
      'API_URL=https://api.example.com\nSECRET="s3cr3t value"\n',
    )
    const ran = await cli(
      [
        "env",
        "run",
        "shop",
        "--",
        process.execPath,
        "-e",
        "process.exit(process.env.SECRET === 's3cr3t value' ? 5 : 1)",
      ],
      two,
    )
    expect(ran.code).toBe(5)
    expect((await cli(["env", "list"], two)).data.groups).toEqual([
      expect.objectContaining({ slug: "shop", variables: 2 }),
    ])
  })

  test("restricted pastes cannot be pulled, searched or exported by the CLI", async () => {
    const target = path.join(root, "destination")
    await mkdir(target)
    await getDb().insert(collection).values({ ownerId: "ada", slug: "ui", name: "UI" })
    for (const state of ["pending", "quarantined", "removed"] as const) {
      const created = await seedPaste({
        slug: `restricted-${state}`,
        owner: "ada",
        title: "synthetic-cli-marker",
        content: "synthetic-cli-marker",
        collection: "ui",
      })
      const current = await inspectModeration(getDb(), created.id)
      if (!current) throw new Error("Missing synthetic paste")
      await transitionModeration(
        getDb(),
        {
          commandId: crypto.randomUUID(),
          pasteId: created.id,
          expectedContentVersion: current.contentVersion,
          expectedModerationVersion: current.moderationVersion,
          state,
          reasonCode: "review",
          caseReference: crypto.randomUUID(),
        },
        "cli-test-operator",
      )
      const pulled = await cli(["pull", created.id], target)
      expect(pulled.code).not.toBe(0)
      expect(pulled.stdout + pulled.stderr).not.toContain("synthetic-cli-marker")
      expect((await cli(["search", "synthetic-cli-marker"], root)).data.pastes).toEqual([])
      const collectionResult = await cli(["pull", "collection:ui", "--dir", target], root)
      expect(collectionResult.stdout + collectionResult.stderr).not.toContain(
        "synthetic-cli-marker",
      )
      expect(await readdir(target)).toEqual([])
    }
  })
})
