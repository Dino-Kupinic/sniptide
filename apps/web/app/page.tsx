import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"

// No marketing page yet: send visitors to their workspace or to sign in.
export default async function Page() {
  const session = await getSession()

  redirect(session ? "/dashboard" : "/sign-in")
}
