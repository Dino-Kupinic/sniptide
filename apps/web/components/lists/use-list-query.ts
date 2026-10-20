"use client"

import { usePathname, useRouter } from "next/navigation"
import * as React from "react"

// Keep rapid filter changes together while a route request is pending. Search is debounced;
// filter and page controls immediately navigate to a URL the server can query and bookmark.
export function useListQuery<Query extends { page: number; cursor?: string }>(
  query: Query,
  serialize: (query: Query) => string,
) {
  const router = useRouter()
  const pathname = usePathname()
  const [draft, setDraft] = React.useState(query)
  const latest = React.useRef(query)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pending, startTransition] = React.useTransition()

  React.useEffect(() => {
    if (!pending && timer.current === null) {
      latest.current = query
      setDraft(query)
    }
  }, [query, pending])
  React.useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )

  function update(patch: Partial<Query>, debounce = false) {
    const next = { ...latest.current, ...patch, cursor: patch.cursor, page: patch.page ?? 1 }
    latest.current = next
    setDraft(next)
    if (timer.current !== null) clearTimeout(timer.current)
    const navigate = () => {
      timer.current = null
      const search = serialize(next)
      startTransition(() =>
        router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false }),
      )
    }
    if (debounce) timer.current = setTimeout(navigate, 250)
    else navigate()
  }

  return { query: draft, update, pending }
}
