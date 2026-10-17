"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { z } from "zod"

export async function secretRequest(command: unknown, signal?: AbortSignal) {
  const response = await fetch("/secrets/manage", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(command),
    signal,
  })
  const data: unknown = await response.json()
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(data)
    throw new Error(error.success ? error.data.error : "Request failed.")
  }
  return data
}
export const entriesSchema = z.array(z.object({ name: z.string(), value: z.string() }))
export function useSecretValues() {
  const [values, setValues] = useState<Record<string, string>>({})
  const generation = useRef(0)
  const mounted = useRef(true)
  const clear = useCallback(() => {
    generation.current++
    setValues({})
  }, [])
  useEffect(() => {
    mounted.current = true
    const hide = () => clear()
    window.addEventListener("blur", hide)
    document.addEventListener("visibilitychange", hide)
    return () => {
      mounted.current = false
      generation.current++
      window.removeEventListener("blur", hide)
      document.removeEventListener("visibilitychange", hide)
    }
  }, [clear])
  const hasValues = Object.keys(values).length > 0
  useEffect(() => {
    if (!hasValues) return
    const timer = window.setTimeout(clear, 60000)
    return () => window.clearTimeout(timer)
  }, [clear, hasValues])
  const begin = () => {
    const epoch = generation.current
    return () => mounted.current && epoch === generation.current
  }
  return { values, setValues, clear, begin }
}
export const fieldClass =
  "h-10 w-full border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
