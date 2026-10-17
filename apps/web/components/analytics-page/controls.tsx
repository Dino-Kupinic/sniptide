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
  const [, startTransition] = React.useTransition()
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

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={shown.paste ?? ALL}
        onValueChange={(value) =>
          choose({ range: shown.range, paste: value === ALL || value === null ? undefined : value })
        }
        items={items}
      >
        <SelectTrigger
          aria-label={t("pastes")}
          className="h-[34px] max-w-48 gap-1.5 pr-2.5 pl-3 text-[13px] font-medium"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="min-w-48">
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value} className="text-[13px]">
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <SegmentedControl
        aria-label={t("range")}
        value={shown.range}
        onValueChange={(next) => choose({ range: next, paste: shown.paste })}
        options={rangeOptions}
        className="w-fit"
        itemClassName="px-2.5 whitespace-nowrap"
      />

      <a
        href={analyticsHref("/analytics/export", shown.range, shown.paste)}
        download
        className={cn(
          buttonVariants({ variant: "outline" }),
          "h-[34px] gap-1.5 px-3 text-[13px] [&_svg]:size-[15px]",
        )}
      >
        <DownloadIcon />
        {t("export_csv")}
      </a>
    </div>
  )
}
