import "server-only"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { sqliteTable, text } from "drizzle-orm/sqlite-core"

const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
})

const client = createClient({ url: "file::memory:" })
export const db = drizzle({ client })

const databaseReady = client.execute(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL
  )
`)

export async function getUsers() {
  await databaseReady
  return db.select().from(users)
}

export { users }
