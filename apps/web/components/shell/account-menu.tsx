"use client"

import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@sniptide/ui/components/dropdown-menu"
import { LogOutIcon, SettingsIcon, UserIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"

// Items shared by the sidebar account switcher and the avatar in the mobile top bar.
export function AccountMenuItems({ email }: { email: string }) {
  const router = useRouter()

  async function signOut() {
    await authClient.signOut()
    router.replace("/sign-in")
    router.refresh()
  }

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
      <DropdownMenuItem onClick={signOut}>
        <LogOutIcon />
        Sign out
      </DropdownMenuItem>
    </>
  )
}
