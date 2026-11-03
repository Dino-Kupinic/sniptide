import "server-only"

import { randomBytes } from "node:crypto"
import { oauthClient } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { getDb } from "@/lib/db"

// Clients register themselves (RFC 7591), the way MCP clients such as Claude and Cursor expect.
// Every client is public: it proves itself with PKCE instead of a secret, and the user decides
// whether to trust it on the consent screen, which names the client and where it sends them.

export const CLIENT_PREFIX = "sntc_"
const MAX_REDIRECT_URIS = 10
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"])
// Schemes a browser would run or read locally instead of handing to an app.
const BLOCKED_SCHEMES = new Set(["javascript:", "data:", "file:", "vbscript:", "about:", "blob:"])

export type OAuthClient = typeof oauthClient.$inferSelect

// Whether `value` may receive codes: https anywhere, http only on this machine's loopback
// (RFC 8252 7.3), or an app's own scheme such as cursor:// (RFC 8252 7.1). Never a fragment.
export function isAllowedRedirectUri(value: string) {
  if (value.length > 2000) return false
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.hash || value.includes("#") || url.username || url.password) return false
  if (url.protocol === "https:") return Boolean(url.hostname)
  if (url.protocol === "http:") return LOOPBACK_HOSTS.has(url.hostname)
  return !BLOCKED_SCHEMES.has(url.protocol) && /^[a-z][a-z0-9+.-]*:$/.test(url.protocol)
}

// The registered URI that `value` matches. Loopback URIs match on any port, because native
// clients pick a free port each time they listen (RFC 8252 7.3); everything else matches exactly.
export function matchRedirectUri(client: Pick<OAuthClient, "redirectUris">, value: string) {
  if (client.redirectUris.includes(value)) return value
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== "http:" || !LOOPBACK_HOSTS.has(url.hostname)) return null
  const withoutPort = (target: URL) => {
    const copy = new URL(target)
    copy.port = ""
    return copy.href
  }
  const wanted = withoutPort(url)
  return client.redirectUris.some((uri) => {
    try {
      return withoutPort(new URL(uri)) === wanted
    } catch {
      return false
    }
  })
    ? value
    : null
}

const registrationSchema = z.object({
  redirect_uris: z
    .array(z.string())
    .min(1, "Register at least one redirect URI.")
    .max(MAX_REDIRECT_URIS, `Register at most ${MAX_REDIRECT_URIS} redirect URIs.`)
    .refine(
      (uris) => uris.every(isAllowedRedirectUri),
      "Redirect URIs use https, http on localhost, or an app's own scheme, without a fragment.",
    ),
  client_name: z.string().optional(),
  token_endpoint_auth_method: z
    .literal("none", {
      error: "Only public clients (token_endpoint_auth_method none) are supported.",
    })
    .optional(),
  grant_types: z
    .array(z.string())
    .refine(
      (types) => types.every((type) => type === "authorization_code" || type === "refresh_token"),
      "Only the authorization_code and refresh_token grants are supported.",
    )
    .optional(),
  response_types: z
    .array(z.string())
    .refine(
      (types) => types.every((type) => type === "code"),
      "Only the code response type is supported.",
    )
    .optional(),
})

// A readable name of at most 60 characters, so it fits a token name; control characters dropped.
function cleanName(value: string | undefined) {
  const name = (value ?? "")
    .replace(/\p{Cc}/gu, "")
    .trim()
    .slice(0, 60)
  return name || "MCP client"
}

export type RegistrationResult =
  | { ok: true; client: OAuthClient }
  | { ok: false; error: "invalid_redirect_uri" | "invalid_client_metadata"; description: string }

export async function registerClient(metadata: unknown): Promise<RegistrationResult> {
  const parsed = registrationSchema.safeParse(metadata)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error:
        issue?.path[0] === "redirect_uris" ? "invalid_redirect_uri" : "invalid_client_metadata",
      description: issue?.message ?? "The client metadata isn't valid.",
    }
  }
  const [client] = await getDb()
    .insert(oauthClient)
    .values({
      id: `${CLIENT_PREFIX}${randomBytes(18).toString("base64url")}`,
      name: cleanName(parsed.data.client_name),
      redirectUris: [...new Set(parsed.data.redirect_uris)],
    })
    .returning()
  if (!client) throw new Error("The OAuth client wasn't returned.")
  return { ok: true, client }
}

export async function getClient(id: string) {
  if (!id.startsWith(CLIENT_PREFIX) || id.length > 64) return null
  const [client] = await getDb().select().from(oauthClient).where(eq(oauthClient.id, id))
  return client ?? null
}
