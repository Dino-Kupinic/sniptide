"use client"

import { Button } from "@sniptide/ui/components/button"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { z } from "zod"
import type { SecretDetail } from "@/lib/env/web-store"
import { fieldClass, secretRequest } from "./client"

export function SecretSharing({ group }: { group: SecretDetail }) {
  const router = useRouter()
  const [link, setLink] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  return (
    <section className="space-y-4 border-t border-border pt-6">
      <div>
        <h2 className="font-medium">Protected sharing</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Links show the current values, including later updates and CLI pushes. A password and
          expiry are required. Send the password separately.
        </p>
      </div>
      <form
        autoComplete="off"
        className="flex flex-wrap items-end gap-3"
        onSubmit={async (event) => {
          event.preventDefault()
          setBusy(true)
          setError("")
          const form = event.currentTarget
          const data = new FormData(form)
          try {
            const result = z.object({ url: z.string().url() }).parse(
              await secretRequest({
                operation: "share",
                id: group.id,
                input: { password: data.get("password"), hours: Number(data.get("hours")) },
              }),
            )
            setLink(result.url)
            form.reset()
            router.refresh()
          } catch (error) {
            setError(error instanceof Error ? error.message : "Could not create link.")
          } finally {
            setBusy(false)
          }
        }}
      >
        <label className="min-w-48 flex-1 space-y-2 text-sm">
          Link password
          <input
            className={fieldClass}
            type="password"
            name="password"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            placeholder="At least 12 characters"
          />
        </label>
        <label className="space-y-2 text-sm">
          Expires in
          <select className={fieldClass} name="hours" defaultValue="24">
            <option value="1">1 hour</option>
            <option value="24">1 day</option>
            <option value="168">7 days</option>
          </select>
        </label>
        <Button type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create protected link"}
        </Button>
      </form>
      {link && (
        <div className="space-y-2 border border-border p-4">
          <label className="block text-sm">
            Protected link
            <input
              className={`${fieldClass} mt-2 font-mono`}
              readOnly
              value={link}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link)
              } catch {
                setError("Could not copy the link.")
              }
            }}
          >
            Copy link
          </Button>
          <p className="text-xs text-muted-foreground">
            This link is only shown now. Create another if you lose it.
          </p>
        </div>
      )}
      <div className="space-y-2">
        {group.shares.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active links. This group is private.</p>
        ) : (
          group.shares.map((share) => (
            <div
              key={share.id}
              className="flex items-center justify-between gap-3 border border-border px-4 py-2"
            >
              <span className="text-sm">Expires {new Date(share.expiresAt).toLocaleString()}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  try {
                    await secretRequest({ operation: "revoke", id: group.id, shareId: share.id })
                    setLink("")
                    router.refresh()
                  } catch {
                    setError("Could not revoke the link.")
                  }
                }}
              >
                Revoke
              </Button>
            </div>
          ))
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <details>
        <summary className="cursor-pointer text-sm text-destructive">Delete group</summary>
        <p className="my-3 text-sm text-muted-foreground">
          Deletes every variable and revokes all links. This also removes the CLI env group.
        </p>
        <Button
          variant="destructive"
          onClick={async () => {
            try {
              await secretRequest({ operation: "delete", id: group.id })
              router.push("/secrets")
              router.refresh()
            } catch {
              setError("Could not delete the group.")
            }
          }}
        >
          Permanently delete group
        </Button>
      </details>
    </section>
  )
}
