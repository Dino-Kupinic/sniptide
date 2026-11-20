import { requireSession } from "@/lib/auth"

// Every app page except the editor at /new is for accounts only. The shell above also lets
// visitors without a session write a paste at /new, so the sign-in check for the rest lives here.
// A layout check runs on client navigations too, so a guest who follows a link from the editor
// to an app page is sent to sign-in.
export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  await requireSession()
  return children
}
