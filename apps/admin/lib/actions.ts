"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import type { BroadcastContent } from "./compose"
import { getConfig } from "./config"
import {
  createSession,
  passwordMatches,
  SESSION_COOKIE,
  SESSION_DAYS,
  validSession,
} from "./session"
import {
  type BroadcastResult,
  createDraft,
  deleteDraft,
  previewHtml,
  saveDraft,
  sendTest,
  sendToSubscribers,
} from "./store"

// The proxy already turns away requests without a session. Each action checks again, so an action
// stays protected even if the proxy's matcher changes.
async function signedIn() {
  const store = await cookies()
  return validSession(store.get(SESSION_COOKIE)?.value, getConfig().password)
}

export async function signIn(_state: string | null, form: FormData): Promise<string | null> {
  const { password } = getConfig()
  const input = String(form.get("password") ?? "")
  if (!passwordMatches(input, password)) {
    // A short pause makes guessing slower without bothering the operator.
    await new Promise((resolve) => setTimeout(resolve, 500))
    return "That password isn't right."
  }
  const store = await cookies()
  store.set(SESSION_COOKIE, createSession(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  })
  redirect("/")
}

export async function signOut() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
  redirect("/sign-in")
}

export async function createBroadcastDraft() {
  if (!(await signedIn())) redirect("/sign-in")
  const id = await createDraft()
  redirect(`/${id}`)
}

export async function saveBroadcastDraft(
  id: string,
  content: Partial<BroadcastContent>,
): Promise<BroadcastResult> {
  if (!(await signedIn())) return { ok: false, error: "signedOut" }
  return (await saveDraft(id, content)) ? { ok: true } : { ok: false, error: "alreadySent" }
}

export async function previewBroadcast(content: Partial<BroadcastContent>) {
  if (!(await signedIn())) return null
  return previewHtml(content)
}

export async function sendBroadcastTest(id: string): Promise<BroadcastResult> {
  if (!(await signedIn())) return { ok: false, error: "signedOut" }
  return sendTest(id)
}

export async function sendBroadcastToSubscribers(id: string): Promise<BroadcastResult> {
  if (!(await signedIn())) return { ok: false, error: "signedOut" }
  const result = await sendToSubscribers(id)
  revalidatePath("/")
  return result
}

export async function deleteBroadcastDraft(id: string): Promise<BroadcastResult> {
  if (!(await signedIn())) return { ok: false, error: "signedOut" }
  if (!(await deleteDraft(id))) return { ok: false, error: "alreadySent" }
  revalidatePath("/")
  return { ok: true }
}
