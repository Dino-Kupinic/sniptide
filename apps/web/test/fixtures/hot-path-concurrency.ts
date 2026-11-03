import { mock } from "bun:test"
import assert from "node:assert/strict"
import { paste, pasteFile, pasteRevision, pasteShare, user } from "@workspace/db/schema"

const scenario = process.argv[2]
const started = new Set<string>()
const gate = Promise.withResolvers<void>()
const tick = () => new Promise<void>((resolve) => setImmediate(resolve))
const hold = async (name: string) => {
  started.add(name)
  await gate.promise
}
let viewer: string | null = "owner"
let revisionOffset = -1
const record = {
  id: "paste-id",
  slug: "example",
  ownerId: "owner",
  title: "Example",
  visibility: "private",
  passwordHash: null,
  deletedAt: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  expiresAt: null,
}

class Query {
  table: unknown
  offsetValue = 0
  constructor(readonly fields?: Record<string, unknown>) {}
  from(table: unknown) {
    this.table = table
    return this
  }
  where() {
    return this
  }
  innerJoin() {
    return this
  }
  orderBy() {
    return this
  }
  limit() {
    return this
  }
  offset(value: number) {
    this.offsetValue = value
    return this
  }
}

function query(fields?: Record<string, unknown>) {
  return new Proxy(new Query(fields), {
    get(target, key, receiver) {
      if (key !== "then") return Reflect.get(target, key, receiver)
      const pending = rows(target)
      return pending.then.bind(pending)
    },
  })
}

async function rows(query: Query): Promise<unknown[]> {
  if (scenario === "hydrate") {
    if (query.table === paste) return [record]
    if (query.table === pasteRevision && query.fields?.count) {
      await hold("revision-count")
      return [{ count: 21 }]
    }
    if (query.table === pasteRevision) {
      started.add("revisions")
      revisionOffset = query.offsetValue
      return [{ id: 1, message: "Created", createdAt: new Date(0), restorable: true }]
    }
    if (query.table === pasteFile) {
      started.add("files")
      return [{ pasteId: record.id, name: "a.txt", language: "text", content: "code", bytes: 4 }]
    }
    if (query.table === user) {
      started.add("author")
      return [{ id: "owner", name: "Owner" }]
    }
    return []
  }
  if (scenario === "nav" || scenario === "sidebar") {
    started.add(query.table === pasteShare ? "shared" : query.fields?.count ? "count" : "recent")
    return query.fields?.count ? [{ count: 2 }] : []
  }
  if (scenario === "analytics" || scenario === "hourly") {
    if (query.table === paste && query.fields?.id) {
      await hold("scope")
      return []
    }
    return []
  }
  if (scenario === "settings") {
    started.add("account")
    return [{ email: "current@example.com", emailVerified: true }]
  }
  return []
}

mock.module("server-only", () => ({}))
mock.module("@/lib/db", () => ({
  getDb: () => ({
    select: query,
    execute: async () => {
      started.add("rollup")
      return []
    },
  }),
}))
mock.module("@/lib/auth", () => ({
  getSession: async () => (viewer ? { user: { id: viewer } } : null),
  requireSession: async () => ({
    user: { id: "owner", name: "Owner" },
    session: { id: "session" },
  }),
  getSocialProviders: async () => [],
  isDemoMode: () => false,
}))
mock.module("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => {
    if (scenario === "nav" || scenario === "sidebar") await hold("cookies")
    return { getAll: () => [] }
  },
}))

if (scenario === "hydrate") {
  const { getPaste } = await import("@/lib/pastes/store")
  const pending = getPaste("example", 999)
  await tick()
  assert(started.has("revision-count"))
  assert(started.has("author"), "author reads must start while the revision count is pending")
  assert(started.has("files"), "file reads must start while the revision count is pending")
  assert(!started.has("revisions"), "revision rows must wait for the count to clamp the page")
  gate.resolve()
  const result = await pending
  assert.equal(result?.revisionPage, 2)
  assert.equal(result?.revisionPageCount, 2)
  assert.equal(result?.revisionCount, 21)
  assert.equal(revisionOffset, 20)
  assert.equal(result?.files[0]?.content, "code")
  viewer = null
  started.clear()
  assert.equal(await getPaste("example"), null)
  assert.equal(started.size, 0)
} else if (scenario === "nav" || scenario === "sidebar") {
  const { navCounts, sidebarData } = await import("@/lib/pastes/store")
  const pending = scenario === "nav" ? navCounts() : sidebarData()
  await tick()
  assert(started.has("cookies"))
  assert(started.has("shared"), "shared counts must start while star cookies are pending")
  assert(started.has("count"), "own counts must start while star cookies are pending")
  if (scenario === "sidebar") assert(started.has("recent"))
  gate.resolve()
  const result = await pending
  assert.deepEqual("counts" in result ? result.counts : result, {
    pastes: 2,
    starred: 2,
    shared: 2,
  })
} else if (scenario === "analytics" || scenario === "hourly") {
  const { getAnalyticsReport } = await import("@/lib/pastes/analytics-report")
  const pending = getAnalyticsReport({
    range: scenario === "hourly" ? "24h" : "7d",
    paste: "example",
  })
  await tick()
  assert(started.has("scope"))
  assert.equal(started.has("rollup"), scenario !== "hourly")
  gate.resolve()
  const result = await pending
  assert.equal(result.scope, null)
  assert.equal(result.pasteCount, 0)
} else if (scenario === "settings") {
  mock.module("@/components/settings/usage-section", () => ({
    UsageSection: () => null,
    UsageSectionSkeleton: () => null,
  }))
  mock.module("@/lib/account/usage", () => ({ getAccountTotals: async () => null }))
  mock.module("@/components/settings/settings-view", () => ({ SettingsView: () => null }))
  mock.module("@/lib/api/tokens", () => ({
    listTokens: async () => {
      await hold("tokens")
      return []
    },
  }))
  mock.module("@/lib/account/store", () => ({ readAccountSecurity: async () => ({}) }))
  mock.module("@/lib/env/store", () => ({ listGroups: async () => [] }))
  mock.module("@/lib/pastes/budget", () => ({
    accountBudget: () => ({ bytes: null }),
  }))
  mock.module("@/lib/pastes/store", () => ({ navCounts: async () => ({ pastes: 2 }) }))
  mock.module("@/lib/preference-store", () => ({
    readPreferences: async () => {
      started.add("preferences")
      return { indentation: "4" }
    },
  }))
  mock.module("@/lib/site", () => ({
    getSiteOrigin: async () => ({ origin: "https://share.test" }),
  }))
  mock.module("@/lib/config", () => ({ getConfig: () => ({}) }))
  mock.module("next-intl/server", () => ({ getTranslations: async () => () => "translated" }))
  const { default: Page } = await import("../../app/(app)/settings/page")
  const pending = Page({ searchParams: Promise.resolve({}), params: Promise.resolve({}) })
  await tick()
  assert(started.has("tokens"))
  assert(started.has("account"), "account reads must overlap token reads")
  assert(started.has("preferences"), "preferences must overlap token reads")
  gate.resolve()
  const result = await pending
  assert.equal(result.props.profile.email, "current@example.com")
  assert.equal(result.props.preferences.indentation, "4")
} else if (scenario === "list" || scenario === "trash") {
  mock.module("@/components/lists/paste-list", () => ({ PasteList: () => null }))
  mock.module("@/components/lists/trash-list", () => ({ TrashList: () => null }))
  mock.module("@/components/lists/import-gist", () => ({ ImportGistButton: () => null }))
  mock.module("@/lib/collections/store", () => ({ listCollections: async () => [] }))
  mock.module("@/lib/pastes/card-preview", () => ({ cardPreviews: async () => ({}) }))
  mock.module("@/lib/pastes/rows", () => ({
    toRows: async () => [],
    toTrashRow: () => null,
  }))
  mock.module("@/lib/pastes/lists", () => ({
    listPastePage: async () => {
      started.add("list")
      if (scenario === "trash") await gate.promise
      return { pastes: [], query: {}, pagination: {}, languageOptions: [] }
    },
    trashTotals: async () => {
      started.add("totals")
      return { bytes: 0 }
    },
  }))
  mock.module("@/lib/site", () => ({
    getSiteOrigin: async () => {
      started.add("site")
      return { host: "share.test" }
    },
  }))
  mock.module("next-intl/server", () => ({
    getLocale: async () => {
      started.add("locale")
      if (scenario === "list") await gate.promise
      return "en"
    },
    getTranslations: async () => () => "translated",
  }))
  const { default: Page } =
    scenario === "list"
      ? await import("../../app/(app)/pastes/page")
      : await import("../../app/(app)/trash/page")
  const pending = Page({ searchParams: Promise.resolve({}), params: Promise.resolve({}) })
  await tick()
  assert(started.has("list"), "list reads must not wait for the locale")
  assert(started.has("site"), "origin reads must overlap list reads")
  assert(started.has("locale"))
  assert(!started.has("totals"), "trash totals must wait for the list's purge")
  gate.resolve()
  await pending
  if (scenario === "trash") assert(started.has("totals"))
} else {
  throw new Error(`Unknown scenario ${scenario}`)
}
console.log("ok")
