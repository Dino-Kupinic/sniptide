import { z } from "zod"
import { clientAddress } from "@/lib/client-ip"
import { boundedJson, secretJson } from "@/lib/env/http"
import { sharePasswordSchema } from "@/lib/env/inputs"
import { revealSharedSecret } from "@/lib/env/web-store"

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    if (!/^[A-Za-z0-9_-]{43}$/.test(token))
      return secretJson({ error: "Link unavailable or password incorrect." }, 403)
    const input = z
      .object({ password: sharePasswordSchema })
      .safeParse(await boundedJson(request, 1024))
    if (!input.success) return secretJson({ error: "Link unavailable or password incorrect." }, 403)
    const result = await revealSharedSecret(
      token,
      input.data.password,
      clientAddress(request.headers),
    )
    if (result.status === "limited")
      return secretJson({ error: "Too many attempts. Try again later." }, 429, {
        "Retry-After": String(result.retryAfterSeconds),
      })
    if (result.status === "locked")
      return secretJson({ error: "Link unavailable or password incorrect." }, 403)
    return secretJson({ entries: result.entries })
  } catch {
    return secretJson({ error: "Link unavailable or password incorrect." }, 403)
  }
}
