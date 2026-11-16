"use client"

import { Button } from "@sniptide/ui/components/button"
import { FormError } from "@sniptide/ui/components/form-error"
import { PlugIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import * as React from "react"
import { GitHubIcon } from "@/components/auth/social-buttons"
import { runAction } from "@/lib/feedback"
import { formatDate } from "@/lib/format"
import type { Locale } from "@/lib/i18n/config"
import { connectIntegration, disconnectIntegration } from "@/lib/integrations/actions"
import type { IntegrationSummary } from "@/lib/integrations/store"
import { SettingsSection } from "./section"

// A provider without a logo here gets the plug.
const icons: Record<string, React.ComponentType> = { github: GitHubIcon }

// Accounts at other services that Sniptide imports from. Separate from Connected accounts on the
// Account tab, which are ways to sign in.
export function IntegrationsSection({
  integrations,
  error: initialError,
}: {
  integrations: IntegrationSummary[]
  error: string | null
}) {
  const t = useTranslations("Settings")
  const locale: Locale = useLocale()
  const router = useRouter()
  const [pending, setPending] = React.useState<string | null>(null)
  const [error, setError] = React.useState(initialError)

  async function connect(id: string) {
    setPending(id)
    setError(null)
    // A successful call leaves for the provider, so only a failure comes back.
    const result = await connectIntegration(id).catch(() => null)
    if (result && !result.ok) setError(result.error)
    else if (!result) setError(t("couldnTConnect"))
    setPending(null)
  }

  async function disconnect(id: string, name: string) {
    setPending(id)
    setError(null)
    const result = await runAction(() => disconnectIntegration(id), {
      success: t("accountDisconnected", { provider: name }),
      error: t("couldnTSaveTryAgain"),
    })
    setPending(null)
    if (result.ok) router.refresh()
  }

  return (
    <SettingsSection
      title={t("integrations")}
      description={t("integrationsDescription")}
      repeatsHeading
    >
      <ul
        aria-label={t("integrations")}
        className="overflow-hidden rounded-lg flex flex-col divide-y divide-border border border-border"
      >
        {integrations.map(({ id, name, available, connection }) => {
          const Icon = icons[id]
          const about = t.has(`integrationAbout.${id}`) ? t(`integrationAbout.${id}`) : null
          return (
            <li key={id} className="flex items-center justify-between gap-4 p-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-5 shrink-0 items-center">
                  {Icon ? (
                    <Icon />
                  ) : (
                    <PlugIcon aria-hidden="true" className="size-4 text-muted-foreground" />
                  )}
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium">{name}</span>
                  <span className="text-[13px] leading-5 text-muted-foreground">
                    {connection
                      ? t("integrationConnected", {
                          account: connection.account,
                          date: formatDate(connection.connectedAt, locale),
                        })
                      : available
                        ? about
                        : t("integrationNotSetUp", { provider: name })}
                  </span>
                </div>
              </div>
              {connection ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="max-lg:h-10"
                  loading={pending === id}
                  disabled={pending !== null}
                  onClick={() => disconnect(id, name)}
                >
                  {t("disconnect")}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="max-lg:h-10"
                  loading={pending === id}
                  disabled={pending !== null || !available}
                  onClick={() => connect(id)}
                >
                  {t("connect")}
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      <FormError variant="inline" message={error} />
    </SettingsSection>
  )
}
