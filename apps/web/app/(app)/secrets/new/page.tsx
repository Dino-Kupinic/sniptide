import { redirect } from "next/navigation"
import { SecretEditor } from "@/components/secrets/secret-editor"
import { getSession } from "@/lib/auth"

export const metadata = { title: "New secrets · Sniptide", robots: { index: false, follow: false } }
export default async function Page() {
  if (!(await getSession())) redirect("/sign-in")
  return (
    <main className="ph-no-capture mx-auto w-full max-w-5xl space-y-7 p-5 sm:p-8">
      <div>
        <h1 className="text-2xl font-semibold">New secret group</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Create an encrypted env file for your project.
        </p>
      </div>
      <SecretEditor />
    </main>
  )
}
