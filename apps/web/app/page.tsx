import { redirect } from "next/navigation"
import { getSession, isDemoMode } from "@/lib/auth"

// No marketing page yet: send visitors to their workspace or to sign in (or into the guest account on a demo instance).
export default async function Page() {
  const session = await getSession()

  redirect(session ? "/dashboard" : isDemoMode() ? "/demo" : "/sign-in")
}
