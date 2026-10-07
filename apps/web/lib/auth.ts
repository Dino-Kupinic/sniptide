import "server-only"

import { getCloudflareContext } from "@opennextjs/cloudflare"
import { createAuth } from "@workspace/auth"
import { createDb } from "@workspace/db"
import { nextCookies } from "better-auth/next-js"
import { headers } from "next/headers"
import { cache } from "react"

// Bindings only exist inside a request on Workers, so the auth instance is built per request.
export const getAuth = cache(async () => {
  const { env } = await getCloudflareContext({ async: true })

  return createAuth({
    db: createDb(env.DB),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    plugins: [nextCookies()],
  })
})

export const getSession = cache(async () => {
  const requestHeaders = await headers()
  const auth = await getAuth()

  return auth.api.getSession({ headers: requestHeaders })
})
