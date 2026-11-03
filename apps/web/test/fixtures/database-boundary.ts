import { mock } from "bun:test"

mock.module("server-only", () => ({}))
mock.module("@/lib/db", () => ({
  getDb() {
    throw new Error("DATABASE_SETUP_REACHED")
  },
}))

const { migrate, resetDatabase } = await import("../harness")
await migrate()
await resetDatabase()
