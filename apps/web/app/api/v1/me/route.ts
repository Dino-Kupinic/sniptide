import { user } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { json, withToken } from "@/lib/api/http"
import { getDb } from "@/lib/db"

// Who a token acts for and what it may do. `sniptide login` calls it to check a token before
// saving it.
export async function GET(request: Request) {
  return withToken(request, "read", async ({ userId, scopes }) => {
    const [row] = await getDb()
      .select({ id: user.id, name: user.name, username: user.username })
      .from(user)
      .where(eq(user.id, userId))
    return json({ user: row ?? { id: userId, name: "", username: null }, scopes })
  })
}
