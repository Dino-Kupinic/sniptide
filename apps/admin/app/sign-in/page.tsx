import type { Metadata } from "next"
import { SignInForm } from "@/components/sign-in-form"

export const metadata: Metadata = { title: "Sign in · Sniptide admin" }

export default function Page() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-sidebar p-4">
      <SignInForm />
    </main>
  )
}
