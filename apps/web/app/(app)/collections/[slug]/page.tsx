import { PagePlaceholder } from "@/components/page-header"

export default async function Page({ params }: PageProps<"/collections/[slug]">) {
  const { slug } = await params

  return <PagePlaceholder title={slug} description="Collection views land here in step 4." />
}
