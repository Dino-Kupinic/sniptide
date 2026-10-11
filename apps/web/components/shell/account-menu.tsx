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
import { Kbd } from "@sniptide/ui/components/kbd"
import { SegmentedControl } from "@sniptide/ui/components/segmented-control"
import {
  ArrowUpRightIcon,
  BookIcon,
  ChartColumnIcon,
  CircleHelpIcon,
  GlobeIcon,
  HouseIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import * as React from "react"
import { authClient } from "@/lib/auth-client"

// Where the resource links go. There is no marketing site or docs site in this app yet.
const links = {
  homepage: "https://sniptide.com",
  documentation: "https://github.com/Dino-Kupinic/sniptide#readme",
  help: "https://github.com/Dino-Kupinic/sniptide/issues",
}

// Items shared by the sidebar account switcher and the avatar in the mobile top bar, grouped
// as in the Paper "Account menu open" artboard: account, preferences, resources, log out.
export function AccountMenuItems({ name, email }: { name: string; email: string }) {
  const router = useRouter()

  async function signOut() {
    await authClient.signOut()
    router.replace("/sign-in")
    router.refresh()
  }

  return (
    <>
      <div className="flex min-w-0 flex-col px-3 pt-1.5 pb-2">
        <span className="truncate text-[13px] font-medium">{name}</span>
        <span className="truncate text-xs text-muted-foreground">{email}</span>
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuItem render={<Link href="/settings" />}>
        <SettingsIcon />
        Settings
        <Kbd className="ml-auto bg-transparent text-muted-foreground">⌘,</Kbd>
      </DropdownMenuItem>
      <DropdownMenuItem render={<Link href="/settings?tab=billing" />}>
        <ChartColumnIcon />
        Usage
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <ThemeRow />
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <GlobeIcon />
          Language
          <span className="ml-auto text-xs text-muted-foreground">English</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuContent side="right" align="start" sideOffset={4}>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Only English for now</DropdownMenuLabel>
            <DropdownMenuRadioGroup value="en">
              <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <ExternalItem href={links.homepage} icon={<HouseIcon />}>
        Homepage
      </ExternalItem>
      <ExternalItem href={links.documentation} icon={<BookIcon />}>
        Documentation
      </ExternalItem>
      <ExternalItem href={links.help} icon={<CircleHelpIcon />} arrow={false}>
        Help
      </ExternalItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        onClick={signOut}
        className="data-highlighted:bg-destructive/10 [&_svg]:text-destructive"
      >
        <LogOutIcon />
        Log out
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

const themeOptions = [
  { value: "system", label: <MonitorIcon aria-label="System" /> },
  { value: "light", label: <SunIcon aria-label="Light" /> },
  { value: "dark", label: <MoonIcon aria-label="Dark" /> },
] as const

// Not a menu item: picking a theme keeps the menu open so the change can be seen.
function ThemeRow() {
  const { theme, setTheme } = useTheme()
  // The theme is only known in the browser; show "system" until mounted.
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  return (
    <div className="flex h-9 items-center gap-2 pr-1 pl-3 text-sm">
      <MoonIcon className="size-4 shrink-0 text-muted-foreground" />
      <span id="account-theme-label">Theme</span>
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
