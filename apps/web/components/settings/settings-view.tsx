"use client"

import { Button } from "@sniptide/ui/components/button"
import { Progress } from "@sniptide/ui/components/progress"
import { cn } from "@sniptide/ui/lib/utils"
import { ChevronRightIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import * as React from "react"
import { LanguageSwitcher } from "@/components/language-switcher"
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

export type SettingsTab = "general" | "account" | "defaults" | "notifications" | "api" | "billing"

export interface WorkspaceCounts {
  shared: number
  collections: number
  trash: number
  pastes: number
}

function StorageMeter({ usedMb, limitMb }: { usedMb: number; limitMb: number }) {
  const t = useTranslations("Settings")
  return (
    <div className="rounded-lg flex flex-col gap-3 border border-border p-4">
      <div className="flex items-center justify-between text-[15px] lg:text-sm">
        <span className="font-medium">{t("storage")}</span>
        <span className="text-muted-foreground tabular-nums">
          {t("storageUsage", { used: usedMb, limit: limitMb })}
        </span>
      </div>
      <Progress value={(usedMb / limitMb) * 100} />
    </div>
  )
}

export function SettingsView({
  initialTab,
  profile,
  preferences,
  emailAvailable,
  counts,
  storage,
  api,
  security,
}: {
  initialTab: SettingsTab
  profile: ProfileState
  preferences: Preferences
  emailAvailable: boolean
  security: AccountSecurity & {
    providers: SocialProvider[]
    linkError: string | null
    demo: boolean
  }
  counts: WorkspaceCounts
  storage: { usedMb: number; limitMb: number }
  api: { tokens: TokenSummary[]; envGroups: EnvGroupSummary[]; origin: string }
}) {
  const t = useTranslations("Settings")
  const secretsT = useTranslations("Secrets")
  const workspace = useTranslations("Workspace")
  const tabs: { value: SettingsTab; label: string }[] = [
    { value: "general", label: t("general") },
    { value: "account", label: t("account") },
    { value: "defaults", label: t("pasteDefaults") },
    { value: "notifications", label: workspace("notifications") },
    { value: "api", label: t("apiTokens") },
    { value: "billing", label: t("billing") },
  ]
  const router = useRouter()
  const [tab, setTab] = React.useState(initialTab)

  function selectTab(next: SettingsTab) {
    setTab(next)
    // Keep the tab in the URL so it survives a reload and can be linked to.
    window.history.replaceState(
      null,
      "",
      next === "general" ? "/settings" : `/settings?tab=${next}`,
    )
  }

  return (
    <div className="flex flex-col gap-5 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-6 lg:gap-6 lg:p-7">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-[30px] leading-9 font-bold tracking-[-0.02em] lg:text-4xl lg:leading-10">
          {t("settings")}
        </h1>
        <p className="hidden text-sm text-muted-foreground lg:block">
          {t("manageYourProfilePasteDefaultsAnd")}
        </p>
      </div>

      {/* On phones Settings is also the "More" tab, so it carries the workspace links. */}
      <section aria-label={t("workspace")} className="flex flex-col gap-2 lg:hidden">
        <h2 className="px-1 text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase">
          {t("workspace")}
        </h2>
        <nav className="overflow-hidden rounded-lg flex flex-col divide-y divide-border border border-border text-[15px]">
          {[
            { href: "/secrets", label: secretsT("title"), count: null },
            { href: "/shared", label: t("sharedWithMe"), count: counts.shared },
            { href: "/collections", label: t("collections"), count: counts.collections },
            { href: "/trash", label: t("trash"), count: counts.trash },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex h-12 items-center justify-between px-4 active:bg-muted"
            >
              {item.label}
              <span className="flex items-center gap-1 text-muted-foreground">
                {item.count}
                <ChevronRightIcon className="size-4" />
              </span>
            </Link>
          ))}
        </nav>
      </section>

      <div
        role="tablist"
        aria-label={t("settings")}
        className="-mx-4 flex gap-6 overflow-x-auto border-b border-border px-4 lg:mx-0 lg:px-0"
      >
        {tabs.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            id={`tab-${item.value}`}
            aria-selected={tab === item.value}
            aria-controls="settings-panel"
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
        id="settings-panel"
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        className="flex flex-col"
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
            <DeleteAccountSection pasteCount={counts.pastes} hasPassword={security.hasPassword} />
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
        {tab === "billing" ? (
          <SettingsSection title={t("plan")} description={t("sniptideIsFreeWhileItS")}>
            <div className="rounded-lg flex items-center justify-between border border-border p-4">
              <div className="flex flex-col">
                <span className="text-sm font-medium">{t("free")}</span>
                <span className="text-[13px] text-muted-foreground">
                  {t("planStorage", { limit: storage.limitMb })}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">{t("noPaymentMethodNeeded")}</span>
            </div>
            <StorageMeter usedMb={storage.usedMb} limitMb={storage.limitMb} />
          </SettingsSection>
        ) : null}
      </div>

      <div className="flex flex-col items-center gap-4 lg:hidden">
        <div className="w-full">
          <StorageMeter usedMb={storage.usedMb} limitMb={storage.limitMb} />
        </div>
        <Button
          variant="ghost"
          className="text-[15px]"
          onClick={async () => {
            await authClient.signOut()
            router.replace("/sign-in")
            router.refresh()
          }}
        >
          {t("signOut")}
        </Button>
      </div>
    </div>
  )
}
