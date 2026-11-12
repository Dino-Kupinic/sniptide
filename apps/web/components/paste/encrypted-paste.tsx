"use client"

import {
  DecryptionError,
  decryptPayload,
  type EncryptedPayload,
  keyIdOf,
  readKey,
} from "@sniptide/contracts/encryption"
import { Button } from "@sniptide/ui/components/button"
import { FormError } from "@sniptide/ui/components/form-error"
import { Input } from "@sniptide/ui/components/input"
import { cn } from "@sniptide/ui/lib/utils"
import { KeyRoundIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import * as React from "react"
import { type BrowserHighlightedFile, highlightInBrowser } from "@/lib/highlight/highlight-browser"
import { findKey, rememberKey } from "@/lib/pastes/keyring"
import { FileViewer } from "./file-viewer"
import { GateLayout, PasteGate } from "./paste-gate"
import { SharedPasteView, type SharedPasteViewData, sharedViewerProps } from "./shared-paste-view"

// An end-to-end encrypted paste in the browser. The server sends the ciphertext envelope and the
// key's public id; the key comes from the link's fragment ("#key=…"), from this browser's key
// ring, or from the reader, and never leaves the page.

type Decrypted =
  | { status: "loading" }
  // `rejected` is set once a key was tried and didn't open the paste.
  | { status: "locked"; rejected: boolean }
  | { status: "open"; description: string; files: BrowserHighlightedFile[] }

interface EncryptedPasteState {
  state: Decrypted
  // Tries a pasted link or key. Resolves to whether it opened the paste.
  submit: (input: string) => Promise<boolean>
}

// The key the page already has for `keyId`: the one in the address bar, else a remembered one.
// A key for some other paste is ignored rather than tried.
export async function availableKey(keyId: string) {
  const fromLink = readKey(window.location.hash)
  if (fromLink && (await keyIdOf(fromLink).catch(() => null)) === keyId) return fromLink
  return findKey(keyId)
}

async function open(envelope: string, key: string): Promise<Decrypted> {
  const payload: EncryptedPayload = await decryptPayload(envelope, key)
  return {
    status: "open",
    description: payload.description,
    files: await highlightInBrowser(payload.files),
  }
}

// `remember` keeps a working key in this browser's key ring. The app's own screens do, so an
// owner who opened the full link once can come back from their lists; a share page never does.
export function useEncryptedPaste(
  envelope: string,
  keyId: string,
  remember: boolean,
): EncryptedPasteState {
  const [state, setState] = React.useState<Decrypted>({ status: "loading" })

  const attempt = React.useCallback(
    async (key: string | null, typed: boolean) => {
      if (!key) {
        setState({ status: "locked", rejected: typed })
        return false
      }
      try {
        setState(await open(envelope, key))
        if (remember) void rememberKey(key)
        return true
      } catch (error) {
        if (!(error instanceof DecryptionError)) throw error
        setState({ status: "locked", rejected: true })
        return false
      }
    },
    [envelope, remember],
  )

  React.useEffect(() => {
    let current = true
    const load = () =>
      availableKey(keyId).then((key) => {
        if (current) void attempt(key, false)
      })
    void load()
    // Pasting the full link into the address bar of the open page only changes the fragment.
    window.addEventListener("hashchange", load)
    return () => {
      current = false
      window.removeEventListener("hashchange", load)
    }
  }, [keyId, attempt])

  const submit = React.useCallback((input: string) => attempt(readKey(input), true), [attempt])
  return { state, submit }
}

// Asks for the key when the link came without it. `onKey` receives the pasted link or key and
// resolves to whether it fits.
export function KeyForm({
  rejected = false,
  submitLabel,
  onKey,
}: {
  rejected?: boolean
  submitLabel?: string
  onKey: (input: string) => Promise<boolean>
}) {
  const t = useTranslations("Paste")
  const inputId = React.useId()
  const errorId = React.useId()
  const [failed, setFailed] = React.useState(rejected)
  const [pending, startTransition] = React.useTransition()

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        const input = String(new FormData(event.currentTarget).get("key"))
        startTransition(async () => setFailed(!(await onKey(input))))
      }}
    >
      <div className="flex flex-col gap-2">
        <label htmlFor={inputId} className="text-sm font-medium">
          {t("linkOrKey")}
        </label>
        <Input
          id={inputId}
          name="key"
          type="text"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          required
          aria-invalid={failed}
          aria-describedby={failed ? errorId : undefined}
          onChange={() => setFailed(false)}
          className="font-mono text-base lg:text-sm"
        />
        <FormError id={errorId} variant="inline" message={failed ? t("keyDoesNotFit") : null} />
      </div>
      <Button type="submit" size="lg" loading={pending} className="w-full">
        {submitLabel ?? t("decrypt")}
      </Button>
    </form>
  )
}

function KeyGate({
  slug,
  rejected,
  note,
  onKey,
}: {
  slug: string
  rejected: boolean
  note?: React.ReactNode
  onKey: (input: string) => Promise<boolean>
}) {
  const t = useTranslations("Paste")
  return (
    <PasteGate
      slug={slug}
      icon={<KeyRoundIcon />}
      title={t("keyNeeded")}
      description={
        <>
          <p>{t("keyNeededDescription")}</p>
          {note}
        </>
      }
    >
      <KeyForm rejected={rejected} onKey={onKey} />
    </PasteGate>
  )
}

// The share page of an encrypted paste: the key prompt until a key fits, then the same view as
// any other share page, coloured in the browser.
export function EncryptedSharedPaste({
  slug,
  gone = false,
  paste,
  envelope,
  keyId,
  notice,
  after,
}: {
  slug: string
  // A burn-after-read reveal just used the paste up.
  gone?: boolean
  paste: Omit<SharedPasteViewData, "files" | "encrypted">
  envelope: string
  keyId: string
  notice?: React.ReactNode
  after?: React.ReactNode
}) {
  const { state, submit } = useEncryptedPaste(envelope, keyId, false)

  if (state.status === "loading") return <div aria-busy="true" className="flex-1" />
  if (state.status === "locked") {
    return (
      <GateLayout after={after}>
        <KeyGate slug={slug} rejected={state.rejected} onKey={submit} />
      </GateLayout>
    )
  }
  return (
    <SharedPasteView
      slug={slug}
      gone={gone}
      paste={{ ...paste, files: state.files, allowRaw: false, encrypted: true }}
      notice={notice}
      viewer={
        <FileViewer
          slug={slug}
          files={state.files}
          rawAllowed={false}
          {...sharedViewerProps(state.files.length === 1, false)}
        />
      }
      after={after}
    />
  )
}

const EncryptedPasteContext = React.createContext<EncryptedPasteState | null>(null)

// Decrypts once for the app's paste page, whose description and code card sit in different
// places of a server-rendered layout.
export function EncryptedPasteProvider({
  envelope,
  keyId,
  children,
}: {
  envelope: string
  keyId: string
  children: React.ReactNode
}) {
  const value = useEncryptedPaste(envelope, keyId, true)
  return <EncryptedPasteContext.Provider value={value}>{children}</EncryptedPasteContext.Provider>
}

function useEncryptedPasteContext() {
  const value = React.useContext(EncryptedPasteContext)
  if (!value) throw new Error("EncryptedPasteProvider is missing.")
  return value
}

export function DecryptedDescription({ className }: { className?: string }) {
  const { state } = useEncryptedPasteContext()
  if (state.status !== "open" || !state.description) return null
  return <p className={className}>{state.description}</p>
}

// The app page's code card: the decrypted files, or the key prompt in the card's place.
export function DecryptedFileViewer({
  slug,
  className,
  ...viewer
}: Omit<React.ComponentProps<typeof FileViewer>, "files" | "rawAllowed" | "printable">) {
  const t = useTranslations("Paste")
  const { state, submit } = useEncryptedPasteContext()

  if (state.status === "open") {
    return (
      <FileViewer
        {...viewer}
        slug={slug}
        files={state.files}
        rawAllowed={false}
        className={className}
      />
    )
  }
  return (
    <div
      aria-busy={state.status === "loading"}
      className={cn("flex min-w-0 items-center justify-center py-8", className)}
    >
      {state.status === "locked" ? (
        <KeyGate
          slug={slug}
          rejected={state.rejected}
          note={<p>{t("keyNeededOwnerNote")}</p>}
          onKey={submit}
        />
      ) : null}
    </div>
  )
}
