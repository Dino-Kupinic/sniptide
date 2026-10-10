import { SharedList } from "@/components/lists/shared-list"
import { toSharedRows } from "@/lib/pastes/rows"
import { listShared } from "@/lib/pastes/store"
import { getSiteOrigin } from "@/lib/site"

export const metadata = { title: "Shared with me · Sniptide" }

export default async function Page() {
  const [entries, { origin, host }] = await Promise.all([listShared(), getSiteOrigin()])
  const rows = await toSharedRows(entries)

  return <SharedList rows={rows} origin={origin} host={host} />
}
