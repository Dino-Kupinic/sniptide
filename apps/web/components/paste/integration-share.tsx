"use client"

import { Button } from "@sniptide/ui/components/button"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxSearch,
  ComboboxTrigger,
} from "@sniptide/ui/components/combobox"
import { FormError } from "@sniptide/ui/components/form-error"
import { toast } from "@sniptide/ui/components/toast"
import { ChevronDownIcon, HashIcon, LockIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import * as React from "react"
import { listExportDestinations, sendToDestination } from "@/lib/integrations/actions"
import type { ExportDestination } from "@/lib/integrations/types"

export interface ShareDestinationProvider {
  id: string
  name: string
  connected: boolean
}

// "Send to Slack" and any other service a paste can be sent to, in the Share dialog. A connected
// service lists its destinations when the row opens; an unconnected one points to Settings.
export function IntegrationShare({
  slug,
  providers,
  reveal,
  unavailableReason,
}: {
  slug: string
  providers: ShareDestinationProvider[]
  // What the destination receives, from the content policy in lib/integrations/exports.ts.
  reveal: "details" | "link"
  unavailableReason?: string
}) {
  return providers.map((provider) => (
    <ProviderRow
      key={provider.id}
      slug={slug}
      provider={provider}
      reveal={reveal}
      unavailableReason={unavailableReason}
    />
  ))
}

function ProviderRow({
  slug,
  provider,
  reveal,
  unavailableReason,
}: {
  slug: string
  provider: ShareDestinationProvider
  reveal: "details" | "link"
  unavailableReason?: string
}) {
  const t = useTranslations("Paste")
  const [destinations, setDestinations] = React.useState<ExportDestination[] | null>(null)
  const [chosen, setChosen] = React.useState<ExportDestination | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, startLoading] = React.useTransition()
  const [sending, startSending] = React.useTransition()

  function load() {
    if (!provider.connected || destinations || loading) return
    setError(null)
    startLoading(async () => {
      try {
        const result = await listExportDestinations(provider.id)
        if (result.ok) setDestinations(result.destinations)
        else setError(result.error)
      } catch {
        setError(t("couldnTLoadDestinations", { service: provider.name }))
      }
    })
  }

  function send() {
    if (!chosen) return
    setError(null)
    startSending(async () => {
      try {
        const result = await sendToDestination(provider.id, slug, chosen.id)
        if (result.ok) toast.success(t("sentToChannel", { channel: chosen.name }))
        else setError(result.error)
      } catch {
        setError(t("couldnTConfirmDeliveryCheckThe"))
      }
    })
  }

  return (
    <details
      className="group border-t border-border px-4 py-3 lg:px-6"
      onToggle={(event) => {
        if (event.currentTarget.open) load()
      }}
    >
      <summary className="cursor-pointer text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
        {t("sendToService", { service: provider.name })}
      </summary>
      <div className="flex flex-col gap-3 pt-3">
        {!provider.connected ? (
          <p className="text-xs text-muted-foreground">
            {t.rich("connectServiceToSend", {
              service: provider.name,
              link: (chunks) => (
                <Link
                  href="/settings?tab=integrations"
                  className="text-link underline-offset-2 outline-none hover:underline focus-visible:underline"
                >
                  {chunks}
                </Link>
              ),
            })}
          </p>
        ) : (
          <>
            <div className="flex gap-2 max-lg:flex-col">
              <Combobox
                items={destinations ?? []}
                value={chosen}
                onValueChange={(value: ExportDestination | null) => setChosen(value)}
                itemToStringLabel={(item: ExportDestination) => item.name}
                autoHighlight
              >
                <ComboboxTrigger
                  aria-label={t("channel")}
                  disabled={!destinations || Boolean(unavailableReason)}
                  className="inline-flex h-9 min-w-0 flex-1 items-center max-lg:flex-none gap-2 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none select-none focus-visible:border-primary disabled:opacity-50 data-popup-open:border-foreground/40 max-lg:h-10"
                >
                  {chosen ? (
                    <DestinationLabel destination={chosen} />
                  ) : (
                    <span className="truncate text-muted-foreground">
                      {loading ? t("loadingChannels") : t("pickAChannel")}
                    </span>
                  )}
                  <ChevronDownIcon className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
                </ComboboxTrigger>
                <ComboboxContent aria-label={t("channel")}>
                  <ComboboxSearch
                    placeholder={t("searchChannels")}
                    aria-label={t("searchChannels")}
                  />
                  <ComboboxEmpty>{t("noChannelsFound")}</ComboboxEmpty>
                  <ComboboxList>
                    {(item: ExportDestination) => (
                      <ComboboxItem key={item.id} value={item}>
                        <DestinationLabel destination={item} />
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
              <Button
                className="max-lg:h-10"
                disabled={!chosen || Boolean(unavailableReason)}
                loading={sending}
                onClick={send}
              >
                {t("send")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {unavailableReason ??
                (reveal === "details" ? t("sendsTitleLanguageAndLink") : t("sendsLinkOnly"))}
            </p>
          </>
        )}
        <FormError variant="inline" message={error} className="text-xs" />
      </div>
    </details>
  )
}

function DestinationLabel({ destination }: { destination: ExportDestination }) {
  const Icon = destination.private ? LockIcon : HashIcon
  return (
    <>
      <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-left">{destination.name}</span>
    </>
  )
}
