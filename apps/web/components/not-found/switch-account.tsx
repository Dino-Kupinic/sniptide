"use client"

import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"

// Signs out and lands on the sign-in page, the same way the account menu's Log out does.
export function SwitchAccount() {
  const router = useRouter()

  async function switchAccount() {
    await authClient.signOut()
    router.replace("/sign-in")
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={switchAccount}
      className="cursor-pointer text-[13px] leading-[18px] font-medium text-link underline decoration-1 underline-offset-[3px] outline-none hover:decoration-2 focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      Switch account
    </button>
  )
}
