import { Button } from "@sniptide/ui/components/button"
import { FormError } from "@sniptide/ui/components/form-error"
import { Input } from "@sniptide/ui/components/input"
import { Label } from "@sniptide/ui/components/label"
import { Logo } from "@sniptide/ui/components/logo"
import { useState } from "react"
import { messages } from "../lib/messages"
import { instanceOrigin, OAuthError } from "../lib/oauth"
import { HOSTED_INSTANCE, type State } from "../lib/protocol"
import { ask, errorMessage } from "./rpc"

export function SignIn({ onState }: { onState: (state: State) => void }) {
  const [selfHosted, setSelfHosted] = useState(false)
  const [address, setAddress] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signIn() {
    setError(null)
    let instance = HOSTED_INSTANCE
    try {
      if (selfHosted) {
        instance = instanceOrigin(address)
        // The hosted app is in the manifest. Any other address needs the reader's permission, and
        // Chrome only asks from a click.
        const granted = await chrome.permissions.request({ origins: [`${instance}/*`] })
        if (!granted) throw new OAuthError(messages.permissionDenied)
      }
      setPending(true)
      onState(await ask({ type: "signIn", instance }))
    } catch (cause) {
      setError(
        cause instanceof OAuthError ? cause.message : errorMessage(cause, messages.unexpected),
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-4 p-6"
      onSubmit={(event) => {
        event.preventDefault()
        void signIn()
      }}
    >
      <Logo />
      <div className="flex flex-col gap-2 pt-2">
        <h1 className="font-heading text-xl leading-7 font-bold tracking-[-0.02em]">
          {messages.signInTitle}
        </h1>
        <p className="text-sm leading-5 text-muted-foreground">{messages.signInBody}</p>
      </div>
      {selfHosted ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="instance">{messages.instanceLabel}</Label>
          <Input
            id="instance"
            autoFocus
            inputMode="url"
            spellCheck={false}
            autoCapitalize="none"
            className="font-mono"
            placeholder={messages.instancePlaceholder}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
        </div>
      ) : null}
      <FormError message={error} />
      <div className="flex flex-col items-start gap-3">
        <Button type="submit" size="lg" className="w-full" loading={pending}>
          {pending ? messages.signingIn : messages.signIn}
        </Button>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="px-0"
          onClick={() => {
            setSelfHosted(!selfHosted)
            setError(null)
          }}
        >
          {selfHosted ? messages.useHosted : messages.selfHosted}
        </Button>
      </div>
    </form>
  )
}
