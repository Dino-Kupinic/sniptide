"use client"

import { useEffect, useRef, useState } from "react"

// Hover previews a bar; click/tap pins it. Keyboard focus follows the same readout.
export function useBarInteraction(count: number, initial: number, resetKey: unknown) {
  const barsRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [preview, setPreview] = useState<number | null>(null)
  useEffect(() => {
    setSelected(null)
    setPreview(null)
  }, [resetKey])
  const active = preview ?? selected
  function move(index: number) {
    const next = Math.max(0, Math.min(count - 1, index))
    setSelected(next)
    setPreview(next)
    barsRef.current?.querySelectorAll("button")[next]?.focus()
  }
  return {
    barsRef,
    active,
    clearPreview: () => setPreview(null),
    buttonProps: (index: number) => ({
      tabIndex: index === (selected ?? initial) ? 0 : -1,
      "aria-pressed": selected === index,
      onPointerEnter: (event: React.PointerEvent) => {
        if (event.pointerType !== "touch") setPreview(index)
      },
      onFocus: () => setPreview(index),
      onClick: () => {
        setPreview(null)
        setSelected(selected === index ? null : index)
      },
      onKeyDown: (event: React.KeyboardEvent) => {
        const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key]
        if (step) move(index + step)
        else if (event.key === "Home") move(0)
        else if (event.key === "End") move(count - 1)
        else if (event.key === "Escape") {
          setSelected(null)
          setPreview(null)
        } else return
        event.preventDefault()
      },
    }),
  }
}
