import { notFound, redirect } from "next/navigation"
import { z } from "zod"
import { SecretDetail } from "@/components/secrets/secret-detail"
import { getSession } from "@/lib/auth"
import { secretDetail } from "@/lib/env/web-store"

export const metadata = { title: "Secrets · Sniptide", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) redirect("/sign-in")
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) notFound()
  const group = await secretDetail(session.user.id, id)
  if (!group) notFound()
  return <SecretDetail key={`${id}:${group.revision}`} group={group} />
}
