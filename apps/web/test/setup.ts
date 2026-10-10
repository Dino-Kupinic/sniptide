import { mock } from "bun:test"
import { request } from "./request"

// Stand-ins for what only exists inside a Next request.
mock.module("server-only", () => ({}))

mock.module("@/lib/auth", () => ({
  getSession: async () => (request.viewer ? { user: { id: request.viewer } } : null),
  getPreferences: async () => ({
    indentation: "2",
    secretDetection: true,
    lineNumbers: true,
    defaultVisibility: "unlisted",
    defaultExpiry: "never",
    defaultBurnAfterRead: false,
  }),
}))

mock.module("next/cache", () => ({ revalidatePath: () => {} }))

mock.module("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = request.cookies.get(name)
      return value === undefined ? undefined : { name, value }
    },
    set: (name: string, value: string) => void request.cookies.set(name, value),
  }),
  headers: async () => new Headers(),
}))

// Brings the test database up to date once, before the first test file.
if (process.env.TEST_DATABASE_URL) {
  const { migrate } = await import("./harness")
  await migrate()
}
