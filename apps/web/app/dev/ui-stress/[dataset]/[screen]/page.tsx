import { notFound } from "next/navigation"
import { parsePasteListQuery } from "@/lib/pastes/list-query"

// This route renders the actual components with fixtures. It never reads or writes fixture data
// to the database, and the production guard runs before the fixture/component imports.
export default async function Page({
  params,
  searchParams,
}: PageProps<"/dev/ui-stress/[dataset]/[screen]">) {
  if (process.env.NODE_ENV !== "development") notFound()
  const { dataset, screen } = await params
  const { datasets, screens, stressData } = await import("@/lib/dev/ui-stress-data")
  const selectedDataset = datasets.find((value) => value === dataset)
  const selectedScreen = screens.find((value) => value === screen)
  if (!selectedDataset || !selectedScreen) notFound()
  const { UiStress } = await import("@/components/dev/ui-stress")
  const query = parsePasteListQuery(await searchParams)
  const data = stressData(selectedDataset)
  const filtered = data.rows.filter(
    (row) =>
      (!query.q ||
        row.title.toLowerCase().includes(query.q.toLowerCase()) ||
        row.slug.includes(query.q)) &&
      (!query.languages.length || query.languages.includes(row.language)) &&
      (!query.visibility.length ||
        query.visibility.includes(row.burnAfterRead ? "burn" : row.visibility)),
  )
  const slugs = new Set(filtered.map((row) => row.slug))
  const pageCount = Math.max(1, Math.ceil(filtered.length / 10))
  const page = Math.min(query.page, pageCount)
  return (
    <UiStress
      key={`${dataset}/${screen}`}
      dataset={selectedDataset}
      screen={selectedScreen}
      query={{ ...query, page }}
      pagination={{ page, pageCount, total: filtered.length, totalAll: data.rows.length }}
      data={{
        ...data,
        pastes: data.pastes.filter((row) => slugs.has(row.slug)),
        trash: data.trash.filter((row) => slugs.has(row.slug)),
      }}
    />
  )
}
