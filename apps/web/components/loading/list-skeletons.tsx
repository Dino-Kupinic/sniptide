"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@sniptide/ui/components/table"
import { useTranslations } from "next-intl"
import { Skeleton as MeasuredSkeleton } from "skullet/react"
import { PasteIdentity } from "@/components/lists/paste-identity"
import { PageHeader } from "@/components/page-header"
import { LanguageIcon } from "@/components/paste/language-icon"

const samples = [
  "Request validation",
  "Database connection",
  "Application configuration",
  "Response helpers",
  "Cache settings",
]

export function ListRowsSkeleton({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("Workspace")
  return (
    <MeasuredSkeleton className="min-w-0 overflow-hidden" loading label={t("loading")}>
      <div className="min-w-0 overflow-hidden rounded-lg border border-border">
        <Table className="hidden min-w-[900px] table-fixed lg:table">
          <TableHeader>
            <TableRow>
              <TableHead>{t("paste")}</TableHead>
              <TableHead className="w-36">{t("language")}</TableHead>
              <TableHead className="w-36">{t("visibility")}</TableHead>
              <TableHead className="w-24">{t("views")}</TableHead>
              {!compact && <TableHead className="w-36">{t("expires")}</TableHead>}
              <TableHead className="w-36">{t("updated")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {samples.map((title, index) => (
              <TableRow key={title}>
                <TableCell className="truncate">
                  <PasteIdentity title={title} slug={`sample-${index}`} host="sniptide.example" />
                </TableCell>
                <TableCell>
                  <span>TypeScript</span>
                </TableCell>
                <TableCell>
                  <span>{t("unlisted")}</span>
                </TableCell>
                <TableCell>
                  <span>128</span>
                </TableCell>
                {!compact && (
                  <TableCell>
                    <span>7 days</span>
                  </TableCell>
                )}
                <TableCell>
                  <span>2 hours ago</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <ul className="divide-y divide-border lg:hidden">
          {samples.map((title, index) => (
            <li key={title} className="flex items-center gap-3 px-4 py-3">
              <LanguageIcon language="typescript" />
              <div className="min-w-0 flex-1">
                <PasteIdentity title={title} slug={`sample-${index}`} host="sniptide.example" />
              </div>
              <span>•••</span>
            </li>
          ))}
        </ul>
      </div>
    </MeasuredSkeleton>
  )
}

export function ListPageSkeleton({
  kind = "pastes",
}: {
  kind?: "pastes" | "starred" | "shared" | "trash" | "collection" | "collections" | "secrets"
}) {
  const t = useTranslations("Core")
  const secrets = useTranslations("Secrets")
  const loading = useTranslations("Workspace")
  return (
    <div className="flex flex-col gap-4 p-4 lg:gap-6 lg:p-7">
      <PageHeader title={kind === "secrets" ? secrets("title") : t(kind)} />
      <MeasuredSkeleton className="min-w-0 overflow-hidden" loading label={loading("loading")}>
        <div className="flex h-[46px] items-center justify-between gap-3 lg:h-8">
          <div className="flex h-full w-full items-center rounded-lg border border-border px-3 text-sm lg:w-65">
            {loading("filter_by_title_or_slug")}
          </div>
          <span className="hidden text-sm lg:block">{loading("last_updated")}</span>
        </div>
      </MeasuredSkeleton>
      {kind === "collections" || kind === "secrets" ? (
        <MeasuredSkeleton className="min-w-0 overflow-hidden" loading label={loading("loading")}>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {samples.map((name, index) => (
              <li key={name} className="flex min-h-16 items-center gap-3 px-4 py-3 lg:min-h-14">
                <span skullet-block="" className="size-5 rounded-md bg-muted" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
                <span className="text-xs text-muted-foreground">
                  {index + 4} {loading("pastes")}
                </span>
                <span className="hidden text-xs text-muted-foreground sm:block">2 hours ago</span>
              </li>
            ))}
          </ul>
        </MeasuredSkeleton>
      ) : (
        <ListRowsSkeleton />
      )}
    </div>
  )
}
