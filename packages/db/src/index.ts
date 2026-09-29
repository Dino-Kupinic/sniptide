import { type AuthEnv, createAuth, handleAuthRequest } from "@workspace/auth"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import { usersTable } from "./schema.js"

export type Env = AuthEnv

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  })
}

export default {
  async fetch(request: Request, env: Env) {
    const { pathname } = new URL(request.url)

    if (pathname === "/api/auth" || pathname.startsWith("/api/auth/")) {
      return handleAuthRequest(request, env)
    }

    if (pathname !== "/api/users/me") {
      return jsonResponse({ error: "not_found" }, 404)
    }

    if (request.method !== "GET") {
      return new Response(JSON.stringify({ error: "method_not_allowed" }), {
        status: 405,
        headers: {
          Allow: "GET",
          "Cache-Control": "private, no-store",
          "Content-Type": "application/json; charset=utf-8",
        },
      })
    }

    const session = await createAuth(env).api.getSession({ headers: request.headers })

    if (!session) {
      return jsonResponse({ error: "unauthorized" }, 401)
    }

    if (!session.user.emailVerified) {
      return jsonResponse({ error: "email_verification_required" }, 403)
    }

    const [user] = await drizzle(env.DB)
      .select({
        id: usersTable.id,
        name: usersTable.name,
        age: usersTable.age,
        email: usersTable.email,
      })
      .from(usersTable)
      .where(eq(usersTable.email, session.user.email))
      .limit(1)
      .all()

    if (!user) {
      return jsonResponse({ error: "not_found" }, 404)
    }

    return jsonResponse(user)
  },
}
