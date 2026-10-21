import { notFound } from "next/navigation"
import { parsePasteListQuery } from "@/lib/pastes/list-query"
import { parseSharedListQuery } from "@/lib/pastes/shared-list-query"

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
  const paramsQuery = await searchParams
  const query = parsePasteListQuery(paramsQuery)
  const sharedQuery = parseSharedListQuery(paramsQuery)
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
  const owners = [
    ...new Map(
      data.rows.flatMap((row) =>
        row.owner ? [[row.owner.username, { ...row.owner, id: row.owner.username }] as const] : [],
      ),
    ).values(),
  ]
  const sharedRows = data.rows
    .filter(
      (row) =>
        (!sharedQuery.q ||
          row.title.toLowerCase().includes(sharedQuery.q.toLowerCase()) ||
          row.slug.includes(sharedQuery.q)) &&
        (!sharedQuery.languages.length || sharedQuery.languages.includes(row.language)) &&
        (!sharedQuery.owners.length ||
          Boolean(row.owner && sharedQuery.owners.includes(row.owner.username))) &&
        (!sharedQuery.access.length || sharedQuery.access.includes(row.access)),
    )
    .sort((a, b) =>
      sharedQuery.sort === "title"
        ? a.title.localeCompare(b.title)
        : sharedQuery.sort === "updated"
          ? b.updatedAt - a.updatedAt
          : b.sharedAt - a.sharedAt,
    )
  const sharedPageCount = Math.max(1, Math.ceil(sharedRows.length / 10))
  const sharedPage = Math.min(sharedQuery.page, sharedPageCount)
  return (
    <UiStress
      key={`${dataset}/${screen}`}
      dataset={selectedDataset}
      screen={selectedScreen}
      query={{ ...query, page }}
      pagination={{ page, pageCount, total: filtered.length, totalAll: data.rows.length }}
      shared={{
        rows: sharedRows.slice((sharedPage - 1) * 10, sharedPage * 10),
        query: { ...sharedQuery, page: sharedPage },
        pagination: {
          page: sharedPage,
          pageCount: sharedPageCount,
          total: sharedRows.length,
          totalAll: data.rows.length,
        },
        languageOptions: [...new Set(data.rows.map((row) => row.language))].sort(),
        ownerOptions: owners,
        peopleCount: new Set(sharedRows.map((row) => row.owner?.username)).size,
      }}
      data={{
        ...data,
        pastes: data.pastes.filter((row) => slugs.has(row.slug)),
        trash: data.trash.filter((row) => slugs.has(row.slug)),
      }}
    />
  )
}
