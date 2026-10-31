"use client"

import { buttonVariants } from "@sniptide/ui/components/button"
import { SegmentedControl } from "@sniptide/ui/components/segmented-control"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sniptide/ui/components/select"
import { Spinner } from "@sniptide/ui/components/spinner"
import { cn } from "@sniptide/ui/lib/utils"
import { DownloadIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import * as React from "react"
import { type AnalyticsRange, DEFAULT_RANGE } from "@/lib/pastes/analytics"

const ALL = "all"

function analyticsHref(path: string, range: AnalyticsRange, paste: string | undefined) {
  const params = new URLSearchParams()
  if (range !== DEFAULT_RANGE) params.set("range", range)
  if (paste) params.set("paste", paste)
  const query = params.toString()
  return query ? `${path}?${query}` : path
}

// Paste, range and Export CSV. The choice lives in the URL, so a view can be linked and the
// server renders the figures; the controls follow the pick at once while the page catches up.
export function AnalyticsControls({
  range,
  paste,
  options,
}: {
  range: AnalyticsRange
  paste: string | undefined
  options: { slug: string; title: string }[]
}) {
  const t = useTranslations("Workspace")
  const rangeOptions: { value: AnalyticsRange; label: string }[] = [
    { value: "24h", label: t("24h") },
    { value: "7d", label: t("7_days") },
    { value: "30d", label: t("30_days") },
    { value: "90d", label: t("90_days") },
  ]

  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [shown, setShown] = React.useOptimistic({ range, paste })

  function choose(next: { range: AnalyticsRange; paste: string | undefined }) {
    startTransition(() => {
      setShown(next)
      router.replace(analyticsHref("/analytics", next.range, next.paste), { scroll: false })
    })
  }

  const items = [
    { value: ALL, label: t("all_pastes") },
    ...options.map((option) => ({ value: option.slug, label: option.title })),
  ]

  // Phones: the paste picker and an icon-only Export share the first row, and the range takes the
  // full second row. From lg everything sits on one row with Export last.
  return (
    <div
      aria-busy={pending}
      className="relative flex w-full flex-col gap-2 lg:w-auto lg:flex-row lg:items-center"
    >
      {pending && (
        <span
          role="status"
          className="absolute -top-5 right-0 flex items-center gap-1 text-xs text-muted-foreground"
        >
          <Spinner className="size-3" />
          <span className="sr-only">{t("loading")}</span>
        </span>
      )}
      <div className="flex min-w-0 items-center gap-2 lg:contents">
        <Select
          value={shown.paste ?? ALL}
          onValueChange={(value) =>
            choose({
              range: shown.range,
              paste: value === ALL || value === null ? undefined : value,
            })
          }
          items={items}
        >
          <SelectTrigger
            aria-label={t("pastes")}
            className="h-10 min-w-0 flex-1 gap-1.5 pr-2.5 pl-3 font-medium lg:h-9 lg:max-w-48 lg:flex-none [&>span]:truncate"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="min-w-48">
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <a
          href={analyticsHref("/analytics/export", shown.range, shown.paste)}
          download
          aria-label={t("export_csv")}
          className={cn(
            buttonVariants({ variant: "outline", size: "lg" }),
            "gap-1.5 px-3 max-lg:h-[38px] max-lg:w-10 max-lg:px-0 lg:order-last",
          )}
        >
          <DownloadIcon />
          <span className="max-lg:hidden">{t("export_csv")}</span>
        </a>
      </div>

      <SegmentedControl
        aria-label={t("range")}
        value={shown.range}
        onValueChange={(next) => choose({ range: next, paste: shown.paste })}
        options={rangeOptions}
        className="w-full lg:w-fit"
        itemClassName="px-2.5 whitespace-nowrap max-lg:py-[9px]"
      />
    </div>
  )
}
