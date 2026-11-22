"use client"

import { Spinner } from "@sniptide/ui/components/spinner"
import { ChevronRightIcon } from "lucide-react"
import { useFormStatus } from "react-dom"
import { BackLink } from "@/components/back-link"
import { KIND_ICONS } from "@/components/kind-icon"
import { PageHeader } from "@/components/page-header"
import { createBroadcastDraft } from "@/lib/actions"
import { EMAIL_KINDS, type EmailKind, KINDS } from "@/lib/kinds"

function Option({ kind }: { kind: EmailKind }) {
  const { pending } = useFormStatus()
  const Icon = KIND_ICONS[kind]
  return (
    <button
      type="submit"
      name="kind"
      value={kind}
      disabled={pending}
      aria-busy={pending || undefined}
      className="flex w-full items-center gap-4 px-4 py-4 text-left outline-none hover:bg-muted focus-visible:bg-muted disabled:opacity-50"
    >
      <Icon aria-hidden className="size-5 shrink-0 text-link" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium">{KINDS[kind].name}</span>
        <span className="text-sm text-muted-foreground">{KINDS[kind].description}</span>
      </span>
      {pending ? (
        <Spinner className="size-4 shrink-0 text-muted-foreground" />
      ) : (
        <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      )}
    </button>
  )
}

// New email starts by choosing what kind it is, because each kind has its own template and fields.
export function KindPicker() {
  return (
    <div className="flex flex-col gap-6 p-4 lg:gap-8 lg:p-7">
      <div className="flex flex-col gap-3">
        <BackLink href="/emails" label="Emails" />
        <PageHeader title="New email" description="Choose what kind of email to write." />
      </div>
      <ul className="max-w-[560px] divide-y divide-border overflow-hidden rounded-lg border border-border">
        {EMAIL_KINDS.map((kind) => (
          <li key={kind}>
            <form action={createBroadcastDraft}>
              <Option kind={kind} />
            </form>
          </li>
        ))}
      </ul>
    </div>
  )
}
