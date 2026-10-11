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
import * as React from "react"
import { type AnalyticsRange, DEFAULT_RANGE } from "@/lib/pastes/analytics"

const ALL = "all"

const rangeOptions: { value: AnalyticsRange; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
]

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
    { value: ALL, label: "All pastes" },
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
          aria-label="Pastes"
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
        aria-label="Range"
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
        Export CSV
      </a>
    </div>
  )
}
