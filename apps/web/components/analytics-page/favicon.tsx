"use client"

import { GlobeIcon } from "lucide-react"
import * as React from "react"

// A site's favicon from Google's favicon service, on a white tile so dark logos (GitHub, X) stay
// visible in dark mode. Only the domain is sent, with no referrer. Offline, or if the request
// fails, a globe stands in.
export function Favicon({ domain }: { domain: string }) {
  const [failed, setFailed] = React.useState(false)

  if (failed)
    return <GlobeIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />

  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`}
      alt=""
      width={16}
      height={16}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="size-4 shrink-0 bg-white"
    />
  )
}
