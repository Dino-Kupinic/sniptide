import type { Metadata } from "next"
import { connection } from "next/server"
import { AccountsTable } from "@/components/accounts-table"
import { type AccountSort, listAccountUsage, nearLimit, SORTS, sortAccounts } from "@/lib/accounts"
import { getConfig } from "@/lib/config"

export const metadata: Metadata = { title: "Accounts · Sniptide admin" }

export default async function Page({ searchParams }: PageProps<"/accounts">) {
  await connection()
  const params = await searchParams
  const sort = SORTS.includes(params.sort as AccountSort) ? (params.sort as AccountSort) : "share"
  const direction = params.dir === "asc" ? "asc" : "desc"
  const rows = sortAccounts(await listAccountUsage(), sort, direction)
  const { limits } = getConfig()
  return (
    <AccountsTable
      rows={rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))}
      near={nearLimit(rows).length}
      limits={limits}
      sort={sort}
      direction={direction}
    />
  )
}
