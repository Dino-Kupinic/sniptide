"use server"

import { revalidatePath } from "next/cache"
import { getSession } from "@/lib/auth"
import { deleteGroup } from "@/lib/env/store"
import { actionError, translateActionError } from "@/lib/i18n/action-errors"
import { hit, type Limit } from "@/lib/rate-limit"
import { HOUR_SECONDS } from "@/lib/time"
import { type CreateTokenResult, createToken, revokeToken, type TokenInput } from "./tokens"

// Settings actions for API tokens and env groups. They act on the signed-in account only.

const tokenCreate = (user: string): Limit => ({
  key: `api:token-create:${user}`,
  max: 20,
  windowSeconds: HOUR_SECONDS,
})

export async function createApiToken(input: TokenInput): Promise<CreateTokenResult> {
  const session = await getSession()
  if (!session) return { ok: false, error: await actionError("signInToken") }
  const limit = await hit([tokenCreate(session.user.id)])
  if (!limit.allowed) return { ok: false, error: await actionError("tokenRateLimit") }
  const result = await createToken(session.user.id, input)
  if (result.ok) revalidatePath("/settings")
  return result.ok ? result : { ok: false, error: await translateActionError(result.error) }
}

export async function revokeApiToken(id: string): Promise<{ ok: boolean }> {
  const session = await getSession()
  if (!session) return { ok: false }
  const ok = await revokeToken(session.user.id, id)
  revalidatePath("/settings")
  return { ok }
}

export async function deleteEnvGroup(slug: string): Promise<{ ok: boolean }> {
  const session = await getSession()
  if (!session || typeof slug !== "string") return { ok: false }
  const ok = await deleteGroup(session.user.id, slug)
  revalidatePath("/settings")
  return { ok }
}
