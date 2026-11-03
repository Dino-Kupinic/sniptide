"use client"

import { useLocale } from "next-intl"
import { useSyncExternalStore } from "react"
import { formatDateTime } from "@/lib/format"

const subscribe = () => () => {}

// The server cannot know the browser's timezone. Hydrate with an explicit UTC label,
// then show local time; later server refreshes still use the browser's timezone.
export function LocalDateTime({ value }: { value: number }) {
  const locale = useLocale()
  const dateTime = new Date(value).toISOString()
  const label = useSyncExternalStore(
    subscribe,
    () =>
      formatDateTime(value, locale, {
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timeZoneName: "short",
      }),
    // ISO avoids differences between server and browser versions of Intl during hydration.
    () => `${dateTime.slice(0, 16).replace("T", " ")} UTC`,
  )

  return <time dateTime={dateTime}>{label}</time>
}
