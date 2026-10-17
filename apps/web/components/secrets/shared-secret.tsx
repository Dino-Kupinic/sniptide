"use client"

import { Button } from "@sniptide/ui/components/button"
import { useState } from "react"
import { z } from "zod"
import { entriesSchema, fieldClass, useSecretValues } from "./client"

export function SharedSecret({ token }: { token: string }) {
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const { values, setValues, clear, begin } = useSecretValues()
  return (
    <main className="ph-no-capture mx-auto w-full max-w-xl space-y-6 px-5 py-16">
      <h1 className="text-2xl font-semibold">Protected secrets</h1>
      <p className="text-sm text-muted-foreground">
        Enter the link password to reveal the current values. Values hide after one minute or when
        you leave this window.
      </p>
      <form
        autoComplete="off"
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault()
          setBusy(true)
          setError("")
          clear()
          const active = begin()
          const form = event.currentTarget
          const password = new FormData(form).get("password")
          form.reset()
          try {
            const response = await fetch(`/secret-share/${encodeURIComponent(token)}/reveal`, {
              method: "POST",
              cache: "no-store",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ password }),
            })
            const result: unknown = await response.json()
            if (!response.ok)
              throw new Error(
                response.status === 429
                  ? "Too many attempts. Try again later."
                  : "Link unavailable or password incorrect.",
              )
            const data = z.object({ entries: entriesSchema }).parse(result)
            if (active())
              setValues(Object.fromEntries(data.entries.map((entry) => [entry.name, entry.value])))
          } catch (error) {
            setError(error instanceof Error ? error.message : "Could not reveal secrets.")
          } finally {
            setBusy(false)
          }
        }}
      >
        <label className="block space-y-2 text-sm">
          Link password
          <input
            className={fieldClass}
            name="password"
            type="password"
            autoComplete="off"
            minLength={12}
            maxLength={128}
            required
          />
        </label>
        <Button type="submit" disabled={busy}>
          {busy ? "Checking…" : "Reveal secrets"}
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {Object.keys(values).length > 0 && (
        <section className="space-y-3">
          <Button size="sm" variant="outline" onClick={clear}>
            Hide all
          </Button>
          {Object.entries(values).map(([name, value]) => (
            <div key={name} className="space-y-2 border border-border p-4">
              <h2 className="break-all font-mono text-sm font-medium">{name}</h2>
              <p className="max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-sm">
                {value || "(empty value)"}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(value)
                  } catch {
                    setError("Could not copy the secret.")
                  }
                }}
              >
                Copy
              </Button>
            </div>
          ))}
        </section>
      )}
    </main>
  )
}
