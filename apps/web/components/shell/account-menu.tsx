"use client"

import {
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
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
  ChartColumnIcon,
  CircleHelpIcon,
  GlobeIcon,
  HouseIcon,
  KeyboardIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useTheme } from "next-themes"
import * as React from "react"
import { ShortcutKeys } from "@/components/shortcuts/shortcut-keys"
import { useShortcutsHelp } from "@/components/shortcuts/shortcuts-help"
import { authClient } from "@/lib/auth-client"
import { setLocale } from "@/lib/i18n/actions"
import { localeNames, locales } from "@/lib/i18n/config"

// Where the resource links go: the marketing site, the docs site (apps/docs) and GitHub issues.
const links = {
  homepage: "https://sniptide.com",
  documentation: "https://docs.sniptide.com",
  help: "https://github.com/Dino-Kupinic/sniptide/issues",
}

// Items shared by the sidebar account switcher and the avatar in the mobile top bar, grouped
// as in the Paper "Account menu open" artboard: account, preferences, resources, log out.
export function AccountMenuItems({ name, email }: { name: string; email: string }) {
  const t = useTranslations("Workspace")
  const router = useRouter()
  const locale = useLocale()
  const [changingLocale, startLocaleTransition] = React.useTransition()
  const shortcuts = useShortcutsHelp()

  async function signOut() {
    await authClient.signOut()
    router.replace("/sign-in")
    router.refresh()
  }

  return (
    <>
      <div className="flex min-w-0 flex-col px-3 pt-1.5 pb-2">
        <span title={name} className="truncate text-[13px] font-medium">
          {name}
        </span>
        <span title={email} className="truncate text-xs text-muted-foreground">
          {email}
        </span>
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuItem render={<Link href="/settings" />}>
        <SettingsIcon />
        {t("settings")}
        <ShortcutKeys id="settings" className="ml-auto bg-transparent text-muted-foreground" />
      </DropdownMenuItem>
      <DropdownMenuItem render={<Link href="/settings?tab=billing" />}>
        <ChartColumnIcon />
        {t("usage")}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={shortcuts.open} className="max-lg:hidden">
        <KeyboardIcon />
        {t("keyboard_shortcuts")}
        <ShortcutKeys id="help" className="ml-auto bg-transparent text-muted-foreground" />
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <ThemeRow />
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <GlobeIcon />
          {t("language")}
        </DropdownMenuSubTrigger>
        <DropdownMenuContent side="right" align="start" sideOffset={4}>
          <DropdownMenuGroup>
            <DropdownMenuRadioGroup
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
                <DropdownMenuRadioItem key={language} value={language} disabled={changingLocale}>
                  {localeNames[language]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <ExternalItem href={links.homepage} icon={<HouseIcon />}>
        {t("homepage")}
      </ExternalItem>
      <ExternalItem href={links.documentation} icon={<BookIcon />}>
        {t("documentation")}
      </ExternalItem>
      <ExternalItem href={links.help} icon={<CircleHelpIcon />} arrow={false}>
        {t("help")}
      </ExternalItem>
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
