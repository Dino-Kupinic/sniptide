import { getAccountUsage } from "@/lib/account/usage"
import { json, withToken } from "@/lib/api/http"

export async function GET(request: Request) {
  return withToken(request, "read", async ({ userId }) => json(await getAccountUsage(userId)))
}
