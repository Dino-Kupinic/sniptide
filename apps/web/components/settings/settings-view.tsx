"use client"

import { Button } from "@sniptide/ui/components/button"
import { Progress } from "@sniptide/ui/components/progress"
import { Skeleton } from "@sniptide/ui/components/skeleton"
import { cn } from "@sniptide/ui/lib/utils"
import {
  BellIcon,
  ChartColumnIcon,
  ChevronLeftIcon,
  KeyRoundIcon,
  type LucideIcon,
  PlugIcon,
  ShieldIcon,
  SlidersHorizontalIcon,
  UserIcon,
} from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useTheme } from "next-themes"
import * as React from "react"
import { LanguageSwitcher } from "@/components/language-switcher"
import {
  GroupedCanvas,
  GroupedLinkRow,
  GroupedList,
  GroupedRowBody,
  groupedRowClass,
} from "@/components/lists/grouped-list"
import { UserAvatar } from "@/components/people/user-avatar"
import { useViewer } from "@/components/shell/app-shell"
import { navigateTabs } from "@/components/tab-navigation"
import type { AccountSecurity } from "@/lib/account/store"
import type { TokenSummary } from "@/lib/api/tokens"
import type { SocialProvider } from "@/lib/auth"
import { signOut as signOutAccount } from "@/lib/auth-client"
import type { EnvGroupSummary } from "@/lib/env/store"
import { formatBytes } from "@/lib/format"
import { type Locale, localeNames } from "@/lib/i18n/config"
import type { IntegrationSummary } from "@/lib/integrations/store"
import type { Preferences } from "@/lib/preferences"
import {
  ConnectedAccountsSection,
  DeleteAccountSection,
  EmailSection,
  PasswordSection,
  SessionsSection,
} from "./account-sections"
import { ApiTokensSection, EnvGroupsSection } from "./api-tokens"
import { IntegrationsSection } from "./integrations-section"
import { NotificationSection } from "./notification-section"
import { DefaultsSection, EditorSection, expiryOptions, themeOptions } from "./preference-sections"
import { ProfileSection, type ProfileState } from "./profile-section"
import { SettingsSection } from "./section"

const SETTINGS_TABS = [
  "general",
  "account",
  "defaults",
  "notifications",
  "integrations",
  "api",
  "usage",
] as const
export type SettingsTab = (typeof SETTINGS_TABS)[number]

function parseTab(value: string | null): SettingsTab | null {
  return SETTINGS_TABS.find((candidate) => candidate === value) ?? null
}

function tabHref(tab: SettingsTab) {
  return tab === "general" ? "/settings" : `/settings?tab=${tab}`
}

const titleClass = "font-heading text-[30px] leading-9 font-bold tracking-[-0.02em]"

// The same counter the Usage tab reads. No limit (a self-hosted server that turned it off) leaves
// nothing to measure against.
function StorageMeter({ used, limit }: { used: number; limit: number | null }) {
  const t = useTranslations("Settings")
  const locale = useLocale()
  if (limit === null) return null
  const share = limit > 0 ? Math.min(1, used / limit) : 1
  return (
    <GroupedList label={t("storage")}>
      <li className="flex flex-col gap-3 px-4 py-3.5">
        <span className="flex items-baseline justify-between gap-3 text-[17px] leading-[22px] tabular-nums">
          <span>
            {t("usageOfLimit", {
              used: formatBytes(used, locale),
              limit: formatBytes(limit, locale),
            })}
          </span>
          <span className="text-muted-foreground">
            {new Intl.NumberFormat(locale, { style: "percent" }).format(share)}
          </span>
        </span>
        <Progress value={share * 100} aria-label={t("storage")} />
      </li>
    </GroupedList>
  )
}

// Desktop shows the sections as tabs. On phones /settings is a list of section rows, and
// /settings?tab=… opens one section on its own screen with a back button.
// The settings page around its sections: the title, the tab strip on desktop and the section
// list on phones. None of it needs account data, so the loading state draws it as it is.
function SettingsFrame({
  phoneList,
  children,
}: {
  // The phone's list of settings, given a way to open a section on its own screen. Without
  // it, as while loading, phones list the sections by name.
  phoneList: (open: (tab: SettingsTab) => void) => React.ReactNode
  children: (tab: SettingsTab) => React.ReactNode
}) {
  const t = useTranslations("Settings")
  const panelId = React.useId()
  const tabs: { value: SettingsTab; label: string; icon: LucideIcon }[] = [
    { value: "general", label: t("general"), icon: UserIcon },
    { value: "account", label: t("account"), icon: ShieldIcon },
    { value: "defaults", label: t("pasteDefaults"), icon: SlidersHorizontalIcon },
    { value: "notifications", label: t("notifications"), icon: BellIcon },
    { value: "integrations", label: t("integrations"), icon: PlugIcon },
    { value: "api", label: t("apiTokens"), icon: KeyRoundIcon },
    { value: "usage", label: t("usage"), icon: ChartColumnIcon },
  ]
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
      <GroupedCanvas />
      <div className={cn("flex flex-col gap-1", opened && "max-lg:hidden")}>
        <h1
          className={cn(
            titleClass,
            "max-lg:text-[34px] max-lg:leading-[41px] lg:text-4xl lg:leading-10",
          )}
        >
          {t("settings")}
        </h1>
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
        <div className="flex flex-col gap-7 lg:hidden">{phoneList(openSection)}</div>
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
        {children(tab)}
      </div>
    </div>
  )
}

// Sign out as the last row of the phone's list, centered like an iOS action row.
function SignOutRow() {
  const t = useTranslations("Settings")
  const router = useRouter()
  return (
    <GroupedList>
      <li>
        <button
          type="button"
          className={cn(groupedRowClass, "justify-center pl-0 text-link")}
          onClick={async () => {
            await signOutAccount()
            router.replace("/sign-in")
            router.refresh()
          }}
        >
          {t("signOut")}
        </button>
      </li>
    </GroupedList>
  )
}

// A row of the phone's list that opens one section on its own screen. A modified click keeps
// the link's usual behavior, such as opening the section in a new tab.
function SectionRow({
  tab,
  open,
  label,
  value,
}: {
  tab: SettingsTab
  open: (tab: SettingsTab) => void
  label: string
  value?: React.ReactNode
}) {
  return (
    <GroupedLinkRow
      href={`/settings?tab=${tab}`}
      label={label}
      value={value}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) return
        event.preventDefault()
        open(tab)
      }}
    />
  )
}

// The phone's Settings screen: the profile first, the settings that shape new pastes and the
// app with their current values, the account and usage, then storage and sign out. Every row
// opens its section. Before the account's data arrives, the values it holds wait in skeletons.
function PhoneSettingsList({
  open,
  profile,
  preferences,
  storage,
  tokenCount,
}: {
  open: (tab: SettingsTab) => void
  profile: Pick<ProfileState, "id" | "image" | "name"> & { username: string | null }
  preferences?: Preferences
  storage?: { used: number; limit: number | null } | null
  tokenCount?: number
}) {
  const t = useTranslations("Settings")
  const pending = <Skeleton className="h-4 w-16" />
  const locale = useLocale()
  const { theme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  const themeLabel = themeOptions.find((option) => option.value === (mounted ? theme : "system"))
  const expiryLabel = expiryOptions.find((option) => option.value === preferences?.defaultExpiry)
  return (
    <>
      <GroupedList>
        <li className="group/item">
          <a
            href="/settings?tab=general"
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey) return
              event.preventDefault()
              open("general")
            }}
            className={cn(groupedRowClass, "min-h-[72px]")}
          >
            <UserAvatar person={profile} className="size-11 rounded-md" />
            <GroupedRowBody
              label={
                <span className="flex flex-col gap-0.5">
                  <span className="truncate text-[17px] leading-[22px] font-semibold">
                    {profile.name || profile.username}
                  </span>
                  <span className="truncate text-[13px] leading-4 text-muted-foreground">
                    {t("profileRowDescription")}
                  </span>
                </span>
              }
            />
          </a>
        </li>
      </GroupedList>

      <GroupedList label={t("newPastes")}>
        <SectionRow
          tab="defaults"
          open={open}
          label={t("visibility")}
          value={preferences ? t(preferences.defaultVisibility) : pending}
        />
        <SectionRow
          tab="defaults"
          open={open}
          label={t("expires")}
          value={preferences ? (expiryLabel ? t(expiryLabel.label) : undefined) : pending}
        />
      </GroupedList>

      <GroupedList label={t("app")}>
        <SectionRow
          tab="general"
          open={open}
          label={t("appearance")}
          value={themeLabel ? t(themeLabel.label) : undefined}
        />
        <SectionRow
          tab="general"
          open={open}
          label={t("language")}
          value={localeNames[locale as Locale]}
        />
        <SectionRow tab="notifications" open={open} label={t("notifications")} />
        <SectionRow tab="integrations" open={open} label={t("integrations")} />
        <SectionRow
          tab="api"
          open={open}
          label={t("apiTokens")}
          value={tokenCount === undefined ? undefined : tokenCount > 0 ? tokenCount : undefined}
        />
      </GroupedList>

      <GroupedList>
        <SectionRow tab="account" open={open} label={t("account")} />
        <SectionRow tab="usage" open={open} label={t("usage")} />
      </GroupedList>

      {storage ? <StorageMeter used={storage.used} limit={storage.limit} /> : null}
      <SignOutRow />
    </>
  )
}

// Settings before the account's data arrives. The sections follow under the frame.
export function SettingsLoading() {
  const viewer = useViewer()
  return (
    <SettingsFrame phoneList={(open) => <PhoneSettingsList open={open} profile={viewer} />}>
      {() => null}
    </SettingsFrame>
  )
}

export function SettingsView({
  profile,
  preferences,
  emailAvailable,
  productEmails,
  pasteCount,
  storage,
  api,
  integrations,
  security,
  usage,
}: {
  usage: React.ReactNode
  profile: ProfileState
  preferences: Preferences
  emailAvailable: boolean
  productEmails: { available: boolean; enabled: boolean; canWrite: boolean }
  security: AccountSecurity & {
    providers: SocialProvider[]
    linkError: string | null
    demo: boolean
  }
  pasteCount: number
  storage: { used: number; limit: number | null } | null
  api: { tokens: TokenSummary[]; envGroups: EnvGroupSummary[]; origin: string }
  integrations: { list: IntegrationSummary[]; error: string | null }
}) {
  const t = useTranslations("Settings")
  return (
    <SettingsFrame
      phoneList={(open) => (
        <PhoneSettingsList
          open={open}
          profile={profile}
          preferences={preferences}
          storage={storage}
          tokenCount={api.tokens.length}
        />
      )}
    >
      {(tab) => (
        <>
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
              productEmails={productEmails}
            />
          ) : null}
          {tab === "integrations" ? (
            <IntegrationsSection integrations={integrations.list} error={integrations.error} />
          ) : null}
          {tab === "api" ? (
            <>
              <ApiTokensSection tokens={api.tokens} origin={api.origin} />
              <EnvGroupsSection groups={api.envGroups} />
            </>
          ) : null}
          {tab === "usage" ? usage : null}
        </>
      )}
    </SettingsFrame>
  )
}
