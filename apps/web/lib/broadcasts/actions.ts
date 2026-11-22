"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import type { BroadcastContent } from "./compose"
import {
  type BroadcastResult,
  broadcastSender,
  createDraft,
  deleteDraft,
  previewHtml,
  saveDraft,
  sendTest,
  sendToSubscribers,
} from "./store"

const PATH = "/settings/product-updates"

async function sender() {
  const session = await getSession()
  return session && broadcastSender(session.user) ? session.user : null
}

export async function createBroadcastDraft() {
  const user = await sender()
  if (!user) redirect("/settings")
  const id = await createDraft(user.id)
  redirect(`${PATH}/${id}`)
}

export async function saveBroadcastDraft(
  id: string,
  content: Partial<BroadcastContent>,
): Promise<BroadcastResult> {
  if (!(await sender())) return { ok: false, error: "forbidden" }
  return (await saveDraft(id, content)) ? { ok: true } : { ok: false, error: "alreadySent" }
}

export async function previewBroadcast(content: Partial<BroadcastContent>) {
  if (!(await sender())) return null
  return previewHtml(content)
}

export async function sendBroadcastTest(id: string): Promise<BroadcastResult> {
  const user = await sender()
  if (!user) return { ok: false, error: "forbidden" }
  return sendTest(id, user.email)
}

export async function sendBroadcastToSubscribers(id: string): Promise<BroadcastResult> {
  if (!(await sender())) return { ok: false, error: "forbidden" }
  const result = await sendToSubscribers(id)
  revalidatePath(PATH)
  return result
}

export async function deleteBroadcastDraft(id: string): Promise<BroadcastResult> {
  if (!(await sender())) return { ok: false, error: "forbidden" }
  if (!(await deleteDraft(id))) return { ok: false, error: "alreadySent" }
  revalidatePath(PATH)
  return { ok: true }
}
