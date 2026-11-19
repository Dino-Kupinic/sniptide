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

// Linear's mark in the text color.
function LinearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-foreground">
      <path d="M2.886 4.18A11.982 11.982 0 0 1 11.99 0C18.624 0 24 5.376 24 12.009c0 3.64-1.62 6.903-4.18 9.105L2.887 4.18ZM1.817 5.626l16.556 16.556c-.524.33-1.075.62-1.65.866L.951 7.277c.247-.575.537-1.126.866-1.65ZM.322 9.163l14.515 14.515c-.71.172-1.443.282-2.195.322L0 11.358a12 12 0 0 1 .322-2.195Zm-.17 4.862 9.823 9.824a12.02 12.02 0 0 1-9.824-9.824Z" />
    </svg>
  )
}

// Notion's mark in the text color.
function NotionIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-foreground">
      <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z" />
    </svg>
  )
}

// A provider without a logo here gets the plug.
const icons: Record<string, React.ComponentType> = {
  github: GitHubIcon,
  slack: SlackIcon,
  linear: LinearIcon,
  notion: NotionIcon,
}

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
