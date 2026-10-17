"use client"

import { Button } from "@sniptide/ui/components/button"
import Link from "next/link"
import { useState } from "react"
import { z } from "zod"
import type { SecretDetail as Detail } from "@/lib/env/web-store"
import { secretRequest, useSecretValues } from "./client"
import { SecretEditor } from "./secret-editor"
import { SecretSharing } from "./secret-sharing"

export function SecretDetail({ group }: { group: Detail }) {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState("")
  const { values, setValues, clear, begin } = useSecretValues()
  async function reveal(name: string, copy: boolean) {
    const active = begin()
    try {
      const result = z
        .object({ value: z.string() })
        .parse(await secretRequest({ operation: "reveal", id: group.id, name }))
      if (!active()) return
      if (copy) await navigator.clipboard.writeText(result.value)
      else setValues((previous) => ({ ...previous, [name]: result.value }))
      setError("")
    } catch {
      setError("Could not reveal or copy the secret.")
    }
  }
  return (
    <main className="ph-no-capture mx-auto w-full max-w-5xl space-y-7 p-5 sm:p-8">
      <Link href="/secrets" className="text-sm text-muted-foreground hover:text-foreground">
        ← Secrets
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="break-all font-mono text-2xl font-semibold">{group.slug}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {group.project ?? "Ungrouped"} · {group.environment ?? "No environment"}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            clear()
            setEditing(!editing)
          }}
        >
          {editing ? "Close editor" : "Edit group"}
        </Button>
      </div>
      {editing ? (
        <SecretEditor
          key={group.revision}
          group={group}
          onSaved={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Values hide after one minute or when you leave this window.
            </p>
            <Button variant="ghost" size="sm" onClick={clear}>
              Hide all
            </Button>
          </div>
          <div className="divide-y divide-border border border-border">
            {group.entries.length === 0 && (
              <p className="p-5 text-sm text-muted-foreground">
                No variables yet. Edit this group to add some.
              </p>
            )}
            {group.entries.map((entry) => (
              <div
                key={entry.name}
                className="flex flex-wrap items-center justify-between gap-4 p-4"
              >
                <div className="min-w-0 flex-1">
                  <h2 className="break-all font-mono text-sm font-medium">{entry.name}</h2>
                  <p className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-sm">
                    {Object.hasOwn(values, entry.name)
                      ? values[entry.name] || "(empty value)"
                      : "••••••••••••"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      Object.hasOwn(values, entry.name)
                        ? setValues((previous) =>
                            Object.fromEntries(
                              Object.entries(previous).filter(([name]) => name !== entry.name),
                            ),
                          )
                        : void reveal(entry.name, false)
                    }
                  >
                    {Object.hasOwn(values, entry.name) ? "Hide" : "Reveal"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => reveal(entry.name, true)}>
                    Copy
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <SecretSharing group={group} />
    </main>
  )
}
