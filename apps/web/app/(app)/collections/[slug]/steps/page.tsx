import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { StepEditor } from "@/components/collections/step-editor"
import { listCollectionSteps } from "@/lib/api/pastes"
import { requireSession } from "@/lib/auth"
import { getCollection } from "@/lib/collections/store"

export async function generateMetadata({ params }: PageProps<"/collections/[slug]/steps">) {
  const collection = await getCollection((await params).slug)
  const t = await getTranslations("Workspace")
  return { title: `${t("order_steps")}${collection ? ` · ${collection.name}` : ""} · Sniptide` }
}

export default async function Page({ params }: PageProps<"/collections/[slug]/steps">) {
  const session = await requireSession()
  const { slug } = await params
  const [collection, steps] = await Promise.all([
    getCollection(slug),
    listCollectionSteps(session.user.id, slug),
  ])
  if (!collection || !steps) notFound()
  return <StepEditor collection={collection} steps={steps} />
}
