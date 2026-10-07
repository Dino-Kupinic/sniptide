import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"

// Signed-in visitors have nothing to do on the auth screens.
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getSession()) redirect("/dashboard")

  return children
}
