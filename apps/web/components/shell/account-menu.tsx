"use client"

import {
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
} from "@sniptide/ui/components/dropdown-menu"
import { SegmentedControl } from "@sniptide/ui/components/segmented-control"
import {
  ArrowUpRightIcon,
  BookIcon,
  CircleHelpIcon,
  GlobeIcon,
  HouseIcon,
  KeyboardIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
  UserIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useTheme } from "next-themes"
import * as React from "react"
import { useResourceLinks } from "@/components/shell/resource-links"
import { ShortcutKeys } from "@/components/shortcuts/shortcut-keys"
import { useShortcutsHelp } from "@/components/shortcuts/shortcuts-help"
import { useSiteOrigin } from "@/components/site-host"
import { signOut as signOutAccount } from "@/lib/auth-client"
import { setLocale } from "@/lib/i18n/actions"
import { localeNames, locales } from "@/lib/i18n/config"
import { profilePath } from "@/lib/profile-path"

// Items shared by the sidebar account switcher and the avatar in the mobile top bar, grouped
// as in the Paper "Account menu open" artboard: account, preferences, resources, log out. The
// account row opens the public profile, and Usage lives in Settings.
// A phone has no room for a submenu beside the menu, so `inlineLanguage` lists the languages
// in the menu itself.
export function AccountMenuItems({
  name,
  email,
  username = null,
  inlineLanguage = false,
}: {
  name: string
  email: string
  // Links the public profile; accounts without a username have none.
  username?: string | null
  inlineLanguage?: boolean
}) {
  const origin = useSiteOrigin()
  const t = useTranslations("Workspace")
  const router = useRouter()
  const locale = useLocale()
  const [changingLocale, startLocaleTransition] = React.useTransition()
  const shortcuts = useShortcutsHelp()
  const links = useResourceLinks()

  const languageChoices = (
    <DropdownMenuRadioGroup
      aria-label={t("language")}
      value={locale}
      onValueChange={(value) => {
        const next = locales.find((candidate) => candidate === value)
        if (next)
          startLocaleTransition(async () => {
            await setLocale(next)
            router.refresh()
          })
      }}
    >
      {locales.map((language) => (
        <DropdownMenuRadioItem
          key={language}
          value={language}
          disabled={changingLocale}
          className={inlineLanguage ? "pl-9" : undefined}
        >
          {localeNames[language]}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  )

  const account = (
    <span className="flex min-w-0 flex-col">
      <span title={name} className="truncate text-[13px] font-medium">
        {name}
      </span>
      <span title={email} className="truncate text-xs text-muted-foreground">
        {email}
      </span>
    </span>
  )

  // A phone has no room for a submenu, so it lists these inline like the languages.
  const resources = (
    <>
      <ExternalItem href={links.homepage} icon={<HouseIcon />}>
        {t("homepage")}
      </ExternalItem>
      <ExternalItem href={links.documentation} icon={<BookIcon />}>
        {t("documentation")}
      </ExternalItem>
      <ExternalItem href={links.help} icon={<CircleHelpIcon />} arrow={false}>
        {t("help")}
      </ExternalItem>
    </>
  )

  async function signOut() {
    await signOutAccount()
    router.replace("/sign-in")
    router.refresh()
  }

  return (
    <>
      {username ? (
        // The account row opens the public profile. A plain <a>: the profile can live on the share
        // domain, outside the app's router.
        <DropdownMenuItem
          render={<a href={`${origin}${profilePath(username)}`} />}
          aria-label={`${name}, ${t("your_profile")}`}
          className="h-auto py-1.5"
        >
          {account}
          <UserIcon className="ml-auto" />
        </DropdownMenuItem>
      ) : (
        <div className="flex min-w-0 px-3 pt-1.5 pb-2">{account}</div>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem render={<Link href="/settings" />}>
        <SettingsIcon />
        {t("settings")}
        <ShortcutKeys id="settings" className="ml-auto bg-transparent text-muted-foreground" />
      </DropdownMenuItem>
      <DropdownMenuItem onClick={shortcuts.open} className="max-lg:hidden">
        <KeyboardIcon />
        {t("keyboard_shortcuts")}
        <ShortcutKeys id="help" className="ml-auto bg-transparent text-muted-foreground" />
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <ThemeRow />
      {inlineLanguage ? (
        <DropdownMenuGroup>
          <DropdownMenuLabel
            aria-hidden="true"
            className="flex items-center gap-2 px-3 pt-2 text-sm text-foreground"
          >
            <GlobeIcon className="size-4 text-muted-foreground" />
            {t("language")}
          </DropdownMenuLabel>
          {languageChoices}
        </DropdownMenuGroup>
      ) : (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <GlobeIcon />
            {t("language")}
          </DropdownMenuSubTrigger>
          <DropdownMenuContent side="right" align="start" sideOffset={4}>
            <DropdownMenuGroup>{languageChoices}</DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenuSub>
      )}
      {inlineLanguage ? (
        <>
          <DropdownMenuSeparator />
          {resources}
        </>
      ) : (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <BookIcon />
            {t("resources")}
          </DropdownMenuSubTrigger>
          <DropdownMenuContent side="right" align="start" sideOffset={4}>
            {resources}
          </DropdownMenuContent>
        </DropdownMenuSub>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        onClick={signOut}
        className="data-highlighted:bg-destructive/10 [&_svg]:text-destructive"
      >
        <LogOutIcon />
        {t("log_out")}
      </DropdownMenuItem>
    </>
  )
}

function ExternalItem({
  href,
  icon,
  arrow = true,
  children,
}: {
  href: string
  icon: React.ReactNode
  arrow?: boolean
  children: React.ReactNode
}) {
  return (
    <DropdownMenuItem render={<a href={href} target="_blank" rel="noreferrer" />}>
      {icon}
      {children}
      {arrow ? <ArrowUpRightIcon className="ml-auto size-3.5!" /> : null}
    </DropdownMenuItem>
  )
}

// Not a menu item: picking a theme keeps the menu open so the change can be seen.
function ThemeRow() {
  const t = useTranslations("Workspace")
  const themeOptions = [
    { value: "system", label: <MonitorIcon aria-label={t("system")} /> },
    { value: "light", label: <SunIcon aria-label={t("light")} /> },
    { value: "dark", label: <MoonIcon aria-label={t("dark")} /> },
  ] as const

  const { theme, setTheme } = useTheme()
  // The theme is only known in the browser; show "system" until mounted.
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  return (
    <div className="flex h-9 items-center gap-2 pr-1 pl-3 text-sm">
      <MoonIcon className="size-4 shrink-0 text-muted-foreground" />
      <span id="account-theme-label">{t("theme")}</span>
      <SegmentedControl
        aria-labelledby="account-theme-label"
        value={(mounted ? theme : "system") as "system" | "light" | "dark"}
        onValueChange={setTheme}
        options={[...themeOptions]}
        className="ml-auto border border-border p-0.5"
        itemClassName="flex w-6.5 items-center justify-center py-1 [&_svg]:size-3.5"
      />
    </div>
  )
}
