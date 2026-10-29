"use client"

import { Button } from "@sniptide/ui/components/button"
import { Progress } from "@sniptide/ui/components/progress"
import { cn } from "@sniptide/ui/lib/utils"
import {
  BellIcon,
  ChartColumnIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CreditCardIcon,
  KeyRoundIcon,
  type LucideIcon,
  ShieldIcon,
  SlidersHorizontalIcon,
  UserIcon,
} from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import * as React from "react"
import { LanguageSwitcher } from "@/components/language-switcher"
import { navigateTabs } from "@/components/tab-navigation"
import type { AccountSecurity } from "@/lib/account/store"
import type { TokenSummary } from "@/lib/api/tokens"
import type { SocialProvider } from "@/lib/auth"
import { authClient } from "@/lib/auth-client"
import type { EnvGroupSummary } from "@/lib/env/store"
import type { Preferences } from "@/lib/preferences"
import {
  ConnectedAccountsSection,
  DeleteAccountSection,
  EmailSection,
  PasswordSection,
  SessionsSection,
} from "./account-sections"
import { ApiTokensSection, EnvGroupsSection } from "./api-tokens"
import { NotificationSection } from "./notification-section"
import { DefaultsSection, EditorSection } from "./preference-sections"
import { ProfileSection, type ProfileState } from "./profile-section"
import { SettingsSection } from "./section"

const SETTINGS_TABS = [
  "general",
  "account",
  "defaults",
  "notifications",
  "api",
  "usage",
  "billing",
] as const
export type SettingsTab = (typeof SETTINGS_TABS)[number]

function parseTab(value: string | null): SettingsTab | null {
  return SETTINGS_TABS.find((candidate) => candidate === value) ?? null
}

function tabHref(tab: SettingsTab) {
  return tab === "general" ? "/settings" : `/settings?tab=${tab}`
}

const titleClass = "font-heading text-[30px] leading-9 font-bold tracking-[-0.02em]"

// No limit (a self-hosted server that turned it off) leaves nothing to measure against.
function StorageMeter({ usedMb, limitMb }: { usedMb: number; limitMb: number | null }) {
  const t = useTranslations("Settings")
  if (limitMb === null) return null
  return (
    <div className="rounded-lg flex flex-col gap-3 border border-border p-4">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">{t("storage")}</span>
        <span className="text-muted-foreground tabular-nums">
          {t("storageUsage", { used: usedMb, limit: limitMb })}
        </span>
      </div>
      <Progress value={(usedMb / limitMb) * 100} aria-label={t("storage")} />
    </div>
  )
}

// Desktop shows the sections as tabs. On phones /settings is a list of section rows, and
// /settings?tab=… opens one section on its own screen with a back button.
export function SettingsView({
  profile,
  preferences,
  emailAvailable,
  pasteCount,
  storage,
  api,
  security,
  usage,
}: {
  usage: React.ReactNode
  profile: ProfileState
  preferences: Preferences
  emailAvailable: boolean
  security: AccountSecurity & {
    providers: SocialProvider[]
    linkError: string | null
    demo: boolean
  }
  pasteCount: number
  storage: { usedMb: number; limitMb: number | null }
  api: { tokens: TokenSummary[]; envGroups: EnvGroupSummary[]; origin: string }
}) {
  const t = useTranslations("Settings")
  const panelId = React.useId()
  const tabs: { value: SettingsTab; label: string; icon: LucideIcon }[] = [
    { value: "general", label: t("general"), icon: UserIcon },
    { value: "account", label: t("account"), icon: ShieldIcon },
    { value: "defaults", label: t("pasteDefaults"), icon: SlidersHorizontalIcon },
    { value: "notifications", label: t("notifications"), icon: BellIcon },
    { value: "api", label: t("apiTokens"), icon: KeyRoundIcon },
    { value: "usage", label: t("usage"), icon: ChartColumnIcon },
    { value: "billing", label: t("billing"), icon: CreditCardIcon },
  ]
  const router = useRouter()
  // The tab lives in the URL, so it survives a reload, can be linked to, and the phone back
  // gesture closes an open section. pushState and replaceState update useSearchParams.
  const opened = parseTab(useSearchParams().get("tab"))
  const tab = opened ?? "general"
  const pushed = React.useRef(false)
  const current = tabs.find((item) => item.value === tab)

  function selectTab(next: SettingsTab) {
    window.history.replaceState(null, "", tabHref(next))
  }

  function openSection(next: SettingsTab) {
    pushed.current = true
    window.history.pushState(null, "", `/settings?tab=${next}`)
    window.scrollTo(0, 0)
  }

  function closeSection() {
    if (pushed.current) {
      pushed.current = false
      window.history.back()
    } else {
      window.history.replaceState(null, "", "/settings")
    }
  }

  return (
    <div className="flex flex-col gap-5 px-4 pt-4 pb-6 lg:gap-6 lg:p-7">
      <div className={cn("flex flex-col gap-1", opened && "max-lg:hidden")}>
        <h1 className={cn(titleClass, "lg:text-4xl lg:leading-10")}>{t("settings")}</h1>
        <p className="hidden text-sm text-muted-foreground lg:block">
          {t("manageYourProfilePasteDefaultsAnd")}
        </p>
      </div>

      {opened ? (
        <div className="-ml-2 flex items-center gap-1 lg:hidden">
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label={t("backToSettings")}
            onClick={closeSection}
            className="size-10"
          >
            <ChevronLeftIcon />
          </Button>
          <h1 className={cn(titleClass, "min-w-0 truncate")}>{current?.label}</h1>
        </div>
      ) : (
        <div className="flex flex-col gap-5 lg:hidden">
          <nav
            aria-label={t("settings")}
            className="overflow-hidden rounded-lg flex flex-col divide-y divide-border border border-border"
          >
            {tabs.map((item) => (
              <a
                key={item.value}
                href={`/settings?tab=${item.value}`}
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey) return
                  event.preventDefault()
                  openSection(item.value)
                }}
                className="flex h-12 items-center gap-3 px-4 text-sm font-medium outline-none focus-visible:bg-muted active:bg-muted"
              >
                <item.icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                <ChevronRightIcon
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
                />
              </a>
            ))}
          </nav>
          <StorageMeter usedMb={storage.usedMb} limitMb={storage.limitMb} />
          <Button
            variant="outline"
            size="xl"
            className="w-full"
            onClick={async () => {
              await authClient.signOut()
              router.replace("/sign-in")
              router.refresh()
            }}
          >
            {t("signOut")}
          </Button>
        </div>
      )}

      <div
        role="tablist"
        aria-label={t("settings")}
        className="hidden gap-4 border-b border-border lg:flex xl:gap-6"
      >
        {tabs.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            id={`${panelId}-tab-${item.value}`}
            aria-selected={tab === item.value}
            aria-controls={panelId}
            tabIndex={tab === item.value ? 0 : -1}
            onKeyDown={(event) =>
              navigateTabs(
                event,
                tabs.map((entry) => entry.value),
                item.value,
                selectTab,
              )
            }
            onClick={() => selectTab(item.value)}
            className={cn(
              "-mb-px shrink-0 border-b-2 border-transparent pb-2.5 text-sm whitespace-nowrap text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
              tab === item.value && "border-primary font-medium text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={`${panelId}-tab-${tab}`}
        className={cn("flex flex-col", !opened && "max-lg:hidden")}
      >
        {tab === "general" ? (
          <>
            <ProfileSection profile={profile} />
            <SettingsSection title={t("language")} description={t("languageDescription")}>
              <LanguageSwitcher />
            </SettingsSection>
            <EditorSection initial={preferences} />
          </>
        ) : null}
        {tab === "account" ? (
          <>
            <EmailSection
              email={profile.email}
              emailVerified={profile.emailVerified}
              hasPassword={security.hasPassword}
              emailAvailable={emailAvailable}
            />
            <PasswordSection hasPassword={security.hasPassword} />
            <ConnectedAccountsSection
              linked={security.linked}
              available={security.providers}
              linkError={security.linkError}
            />
            <SessionsSection sessions={security.sessions} demo={security.demo} />
            <DeleteAccountSection pasteCount={pasteCount} hasPassword={security.hasPassword} />
          </>
        ) : null}
        {tab === "defaults" ? <DefaultsSection initial={preferences} /> : null}
        {tab === "notifications" ? (
          <NotificationSection
            initial={preferences.notifications}
            emailAvailable={emailAvailable}
            emailVerified={profile.emailVerified}
          />
        ) : null}
        {tab === "api" ? (
          <>
            <ApiTokensSection tokens={api.tokens} origin={api.origin} />
            <EnvGroupsSection groups={api.envGroups} />
          </>
        ) : null}
        {tab === "usage" ? usage : null}
        {tab === "billing" ? (
          <SettingsSection title={t("plan")} description={t("sniptideIsFreeWhileItS")}>
            <div className="rounded-lg flex flex-col gap-1 border border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="flex min-w-0 flex-col">
                <span className="text-sm font-medium">{t("free")}</span>
                {storage.limitMb === null ? null : (
                  <span className="text-[13px] text-muted-foreground">
                    {t("planStorage", { limit: storage.limitMb })}
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">{t("noPaymentMethodNeeded")}</span>
            </div>
            <StorageMeter usedMb={storage.usedMb} limitMb={storage.limitMb} />
          </SettingsSection>
        ) : null}
      </div>
    </div>
  )
}
