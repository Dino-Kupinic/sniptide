"use client"

import { GlobeIcon } from "lucide-react"
import * as React from "react"

// A site's favicon on a white tile so dark logos (GitHub, X) stay visible in dark mode. It comes
// through app/api/favicon, so the browser never contacts Google itself. Offline, or if the
// request fails, a globe stands in.
export function Favicon({ domain }: { domain: string }) {
  const [failed, setFailed] = React.useState(false)

  if (failed)
    return <GlobeIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />

  return (
    <img
      src={`/api/favicon?domain=${encodeURIComponent(domain)}`}
      alt=""
      width={16}
      height={16}
      loading="lazy"
      onError={() => setFailed(true)}
      className="size-4 shrink-0 bg-white"
    />
  )
}
