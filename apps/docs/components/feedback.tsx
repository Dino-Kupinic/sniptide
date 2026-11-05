"use client"

import { cn } from "@sniptide/ui/lib/utils"
import { useState } from "react"
import { type Rating, ratings } from "@/lib/feedback"
import { getMessages, type Messages } from "@/lib/messages"

const faces: Record<Rating, { emoji: string; label: keyof Messages }> = {
  terrible: { emoji: "😭", label: "ratingTerrible" },
  bad: { emoji: "😕", label: "ratingBad" },
  good: { emoji: "🙂", label: "ratingGood" },
  great: { emoji: "🤩", label: "ratingGreat" },
}

type State = { status: "idle" } | { status: "sent" | "failed"; rating: Rating }

// "Was this helpful?" at the end of a page: four faces from worst to best. The faces stay grey
// until hovered or chosen, and an answer can be changed. Answers go to app/api/feedback.
export function Feedback({ lang, path }: { lang: string; path: string }) {
  const t = getMessages(lang)
  const [state, setState] = useState<State>({ status: "idle" })
  const chosen = state.status === "idle" ? undefined : state.rating

  async function send(rating: Rating) {
    setState({ status: "sent", rating })
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating, path, locale: lang }),
    }).catch(() => null)
    if (!response?.ok) setState({ status: "failed", rating })
  }

  return (
    <div className="not-prose mt-12 flex flex-wrap items-center gap-x-4 gap-y-2">
      <fieldset className="m-0 inline-flex h-10 min-w-0 items-center gap-1 rounded-lg border bg-card py-0 pr-1 pl-4">
        <legend className="sr-only">{t.helpful}</legend>
        <span aria-hidden className="mr-2 text-sm leading-5 font-medium text-foreground">
          {t.helpful}
        </span>
        {ratings.map((rating) => {
          const face = faces[rating]
          const selected = chosen === rating
          return (
            <button
              key={rating}
              type="button"
              aria-pressed={selected}
              title={t[face.label]}
              onClick={() => send(rating)}
              className={cn(
                "flex size-8 items-center justify-center rounded-md text-lg leading-none transition-[background-color,filter,opacity,transform] duration-150 hover:bg-muted hover:opacity-100 hover:grayscale-0 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring active:scale-90 motion-reduce:transition-none",
                selected ? "bg-muted grayscale-0" : "opacity-60 grayscale",
              )}
            >
              <span aria-hidden>{face.emoji}</span>
              <span className="sr-only">{t[face.label]}</span>
            </button>
          )
        })}
      </fieldset>
      <p aria-live="polite" className="text-sm leading-5 text-muted-foreground">
        {state.status === "sent" && t.thanks}
        {state.status === "failed" && <span className="text-destructive">{t.feedbackFailed}</span>}
      </p>
    </div>
  )
}
