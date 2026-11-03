import type * as React from "react"

export function navigateTabs<T extends string>(
  event: React.KeyboardEvent<HTMLElement>,
  ids: readonly T[],
  current: T,
  select: (id: T) => void,
) {
  if (
    event.nativeEvent.isComposing ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  )
    return
  const index = ids.indexOf(current)
  const next =
    event.key === "ArrowRight"
      ? (index + 1) % ids.length
      : event.key === "ArrowLeft"
        ? (index - 1 + ids.length) % ids.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? ids.length - 1
            : -1
  if (next < 0 || !ids.length) return
  const nextId = ids[next]
  if (!nextId) return
  event.preventDefault()
  select(nextId)
  const list = event.currentTarget.closest('[role="tablist"]')
  const tab = list?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]
  tab?.focus()
  tab?.scrollIntoView({ block: "nearest", inline: "nearest" })
}
