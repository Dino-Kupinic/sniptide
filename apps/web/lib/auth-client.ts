"use client"

import { usernameClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"

// Same-origin client: the auth routes live in this app at /api/auth.
export const authClient = createAuthClient({
  plugins: [usernameClient()],
})
