"use client"

import { cn } from "@sniptide/ui/lib/utils"
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

const options = [
  { value: "light", icon: SunIcon },
  { value: "system", icon: MonitorIcon },
  { value: "dark", icon: MoonIcon },
] as const

type Labels = { legend: string; light: string; system: string; dark: string }

// The marketing footer's three-stop slider for the colour scheme (sniptide-web
// components/theme-switch.tsx), driven by next-themes as Fumadocs is. The thumb springs to the
// chosen stop, and under reduced motion it snaps. Until the stored choice is known on the client,
// no stop is drawn as chosen.
export function ThemeSwitch({ className, labels }: { className?: string; labels: Labels }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const index = mounted ? options.findIndex((option) => option.value === theme) : -1

  return (
    <fieldset
      className={cn(
        "relative m-0 grid h-8 w-27 min-w-0 grid-cols-3 rounded-md border-0 bg-muted p-0.75",
        className,
      )}
    >
      <legend className="sr-only">{labels.legend}</legend>
      {index >= 0 && (
        <span
          aria-hidden="true"
          className="absolute inset-y-0.75 left-0.75 w-[calc((100%-6px)/3)] rounded-sm bg-background shadow-[0_1px_2px_rgb(0_0_0/0.08)] transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none dark:bg-accent dark:brightness-150"
          style={{ transform: `translateX(${index * 100}%)` }}
        />
      )}
      {options.map((option) => {
        const checked = mounted && option.value === theme
        return (
          <label
            key={option.value}
            title={labels[option.value]}
            className={cn(
              "relative flex cursor-pointer items-center justify-center rounded-sm has-focus-visible:ring-2 has-focus-visible:ring-ring/40",
              checked ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <input
              type="radio"
              name="theme"
              value={option.value}
              checked={checked}
              onChange={() => setTheme(option.value)}
              className="sr-only"
            />
            <span className="sr-only">{labels[option.value]}</span>
            <option.icon aria-hidden="true" className="size-3.5" strokeWidth={2} />
          </label>
        )
      })}
    </fieldset>
  )
}
