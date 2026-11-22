"use client"

import { Button } from "@sniptide/ui/components/button"
import { FormError } from "@sniptide/ui/components/form-error"
import { Input } from "@sniptide/ui/components/input"
import { Label } from "@sniptide/ui/components/label"
import { Logo } from "@sniptide/ui/components/logo"
import { useActionState } from "react"
import { signIn } from "@/lib/actions"

export function SignInForm() {
  const [error, action, pending] = useActionState(signIn, null)
  return (
    <form
      action={action}
      className="rounded-lg flex w-full max-w-sm flex-col gap-5 border border-border bg-background p-6 shadow-[var(--dialog-shadow)]"
    >
      <Logo className="h-6 w-auto self-start" />
      <h1 className="font-heading text-xl leading-7 font-bold tracking-[-0.02em]">
        Sign in to send product updates
      </h1>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          aria-invalid={Boolean(error)}
        />
        <FormError variant="inline" message={error} />
      </div>
      <Button type="submit" size="lg" loading={pending}>
        Sign in
      </Button>
    </form>
  )
}
