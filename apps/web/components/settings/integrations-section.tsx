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

// Slack's mark in the text color, like the GitHub mark beside it.
function SlackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-foreground">
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
    </svg>
  )
}

// A provider without a logo here gets the plug.
const icons: Record<string, React.ComponentType> = { github: GitHubIcon, slack: SlackIcon }

// Accounts at other services that Sniptide imports from or sends pastes to. Separate from Connected accounts on the
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
