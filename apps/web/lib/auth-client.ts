"use client"

import { usernameClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"
import { forgetShapes } from "skullet"

// Same-origin client: the auth routes live in this app at /api/auth.
export const authClient = createAuthClient({
  plugins: [usernameClient()],
})

// A shared browser must not retain the previous account's loading outlines.
export async function signOut() {
  forgetShapes()
  return authClient.signOut()
}
