"use client"

import * as React from "react"

// The consent form posts with fetch and then leaves for the client's redirect URI itself: the
// app's CSP (form-action 'self') stops a submitted form from following a redirect to another
// origin or to an app's own scheme such as cursor://, but not a script navigation.
export function ConsentForm({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const [pending, setPending] = React.useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const form = new FormData(event.currentTarget)
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    form.set("decision", submitter?.value ?? "deny")
    setPending(true)
    const body = new URLSearchParams()
    for (const [key, value] of form) if (typeof value === "string") body.set(key, value)
    const redirect = await fetch(event.currentTarget.action, {
      method: "POST",
      headers: { accept: "application/json" },
      body,
    })
      .then((response) => response.json() as Promise<{ redirect?: string }>)
      .then((result) => result.redirect)
      .catch(() => undefined)
    if (redirect) return window.location.assign(redirect)
    setPending(false)
    window.location.reload()
  }

  return (
    <form
      method="post"
      action="/api/oauth/authorize"
      onSubmit={onSubmit}
      aria-busy={pending}
      className={className}
    >
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
    </form>
  )
}
