import { drizzle } from "drizzle-orm/d1"
import { usersTable } from "./src/schema.js"

export interface Env {
  DB: D1Database
}
export default {
  async fetch(request: Request, env: Env) {
    const db = drizzle(env.DB)
    const result = await db.select().from(usersTable).all()
    return Response.json(result)
  },
}
