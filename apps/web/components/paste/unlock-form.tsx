"use client"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { LockIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { unlockPaste } from "@/lib/pastes/actions"

export function UnlockForm({ slug }: { slug: string }) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  return (
    <form
      className="flex w-full max-w-sm flex-col gap-4 border border-foreground bg-background p-6 shadow-[8px_8px_0_0_var(--foreground)]"
      onSubmit={(event) => {
        event.preventDefault()
        const password = String(new FormData(event.currentTarget).get("password"))
        startTransition(async () => {
          const result = await unlockPaste(slug, password)
          if (!result.ok) return setError(result.error)
          router.refresh()
        })
      }}
    >
      <LockIcon className="size-5" />
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-bold tracking-[-0.02em] uppercase">
          Password needed
        </h1>
        <p className="text-sm text-muted-foreground">
          Whoever shared this paste protected it with a password.
        </p>
      </div>
      <Input
        name="password"
        type="password"
        aria-label="Password"
        autoComplete="off"
        required
        aria-invalid={Boolean(error)}
        className="h-10 text-base lg:text-sm"
      />
      {error ? (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="h-10">
        {pending ? "Checking…" : "Unlock"}
      </Button>
    </form>
  )
}
