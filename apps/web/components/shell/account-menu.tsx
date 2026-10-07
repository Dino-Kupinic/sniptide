"use client"

import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@workspace/ui/components/dropdown-menu"
import { LogOutIcon, SettingsIcon, UserIcon } from "lucide-react"
import Link from "next/link"

// Items shared by the sidebar account switcher and the avatar in the mobile top bar.
export function AccountMenuItems({ email }: { email: string }) {
  return (
    <>
      <DropdownMenuLabel>{email}</DropdownMenuLabel>
      <DropdownMenuItem render={<Link href="/settings" />}>
        <UserIcon />
        Profile
      </DropdownMenuItem>
      <DropdownMenuItem render={<Link href="/settings" />}>
        <SettingsIcon />
        Settings
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem>
        <LogOutIcon />
        Sign out
      </DropdownMenuItem>
    </>
  )
}
