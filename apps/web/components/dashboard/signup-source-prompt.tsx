"use client"

import { Button } from "@sniptide/ui/components/button"
import { useTranslations } from "next-intl"
import * as React from "react"
import { track } from "@/lib/analytics"
import { SIGNUP_SOURCES, type SignupSourceAnswer } from "@/lib/signup-source"
import { answerSignupSource } from "@/lib/signup-source-actions"

// A one-time, skippable question for a new account. It sits on the dashboard rather than the
// sign-up form, so it works the same for email and social sign-up and never slows sign-up down.
export function SignupSourcePrompt() {
  const t = useTranslations("Workspace.signupSource")
  const [done, setDone] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState(false)

  async function answer(value: SignupSourceAnswer) {
    setPending(true)
    setError(false)
    const result = await answerSignupSource(value).catch(() => ({ ok: false as const }))
    setPending(false)
    if (!result.ok) return setError(true)
    if (value !== "skipped") track("signup_source_answered", { source: value })
    setDone(true)
  }

  if (done) return null

  return (
    <section
      aria-labelledby="signup-source-title"
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="signup-source-title" className="text-sm font-medium">
          {t("title")}
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={pending}
          onClick={() => answer("skipped")}
        >
          {t("skip")}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {SIGNUP_SOURCES.map((source) => (
          <Button
            key={source}
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => answer(source)}
          >
            {t(`options.${source}`)}
          </Button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {t("error")}
        </p>
      ) : null}
    </section>
  )
}
