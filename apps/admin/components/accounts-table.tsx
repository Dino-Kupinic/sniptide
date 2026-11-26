"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortHead,
} from "@sniptide/ui/components/table"
import { usePathname, useRouter } from "next/navigation"
import { PageHeader } from "@/components/page-header"
import { formatBytes, formatDate, percent } from "@/lib/format"

type Sort = "share" | "storage" | "pastes" | "api"

export interface AccountsTableRow {
  id: string
  name: string
  email: string
  createdAt: string
  storageBytes: number
  pasteCount: number
  apiPeakDay: number
  shares: { storage: number | null; pastes: number | null; api: number }
}

const number = new Intl.NumberFormat("en-US")
const NEAR = 0.8

// A figure, its share of the limit and a bar on one scale from 0 to 100%. A share at 80% or more
// is set in the foreground color and weight, so it doesn't rely on the bar's color alone.
function Usage({ value, share }: { value: string; share: number | null }) {
  const near = share !== null && share >= NEAR
  return (
    <div className="flex min-w-36 flex-col items-end gap-1 tabular-nums">
      <span>
        {value}
        {share === null ? null : (
          <span
            className={near ? "ml-2 font-medium text-foreground" : "ml-2 text-muted-foreground"}
          >
            {percent(share)}
          </span>
        )}
      </span>
      {share === null ? null : (
        <span aria-hidden className="block h-1 w-full overflow-hidden rounded-sm bg-muted">
          <span
            className="block h-full bg-primary"
            style={{ width: `${Math.min(100, share * 100)}%` }}
          />
        </span>
      )}
    </div>
  )
}

export function AccountsTable({
  rows,
  near,
  limits,
  sort,
  direction,
}: {
  rows: AccountsTableRow[]
  near: number
  limits: { bytes: number | null; pastes: number | null }
  sort: Sort
  direction: "asc" | "desc"
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sortBy = (column: Sort) => (next: "asc" | "desc") =>
    router.replace(`${pathname}?sort=${column}${next === "asc" ? "&dir=asc" : ""}`)
  const head = (column: Exclude<Sort, "share">, label: string) => (
    <TableSortHead
      alignEnd
      direction={sort === column ? direction : null}
      firstDirection="desc"
      onSort={sortBy(column)}
    >
      {label}
    </TableSortHead>
  )
  const limitsLine = [
    limits.bytes === null ? "no storage limit" : `${formatBytes(limits.bytes)} of storage`,
    limits.pastes === null ? "no paste limit" : `${number.format(limits.pastes)} pastes`,
    "86,400 API requests per token a day",
  ].join(", ")
  return (
    <div className="flex flex-col gap-6 p-4 lg:gap-8 lg:p-7">
      <PageHeader
        title="Accounts"
        description={
          near === 0
            ? `No account is at 80% of a limit. Each account may keep ${limitsLine}.`
            : `${number.format(near)} ${near === 1 ? "account is" : "accounts are"} at 80% or more of a limit. Each account may keep ${limitsLine}.`
        }
      />
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No one has signed up yet.</p>
      ) : (
        <>
          {/* Phones get a list, so every account shows all three figures without scrolling. */}
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border lg:hidden">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-col gap-3 p-4">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{row.name}</span>
                  <span className="truncate text-[13px] text-muted-foreground">
                    {row.email} · {formatDate(new Date(row.createdAt))}
                  </span>
                </span>
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                  {(
                    [
                      ["Storage", formatBytes(row.storageBytes), row.shares.storage],
                      ["Pastes", number.format(row.pasteCount), row.shares.pastes],
                      ["Busiest API day", number.format(row.apiPeakDay), row.shares.api],
                    ] as const
                  ).map(([label, value, share]) => (
                    <div key={label} className="contents">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="min-w-0">
                        <Usage value={value} share={share} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-hidden rounded-lg border border-border lg:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Account</TableHead>
                  <TableHead>Joined</TableHead>
                  {head("storage", "Storage")}
                  {head("pastes", "Pastes")}
                  {head("api", "Busiest API day, 7 days")}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="max-w-64">
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">{row.name}</span>
                        <span className="truncate text-[13px] text-muted-foreground">
                          {row.email}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(new Date(row.createdAt))}
                    </TableCell>
                    <TableCell>
                      <Usage value={formatBytes(row.storageBytes)} share={row.shares.storage} />
                    </TableCell>
                    <TableCell>
                      <Usage value={number.format(row.pasteCount)} share={row.shares.pastes} />
                    </TableCell>
                    <TableCell>
                      <Usage value={number.format(row.apiPeakDay)} share={row.shares.api} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  )
}
