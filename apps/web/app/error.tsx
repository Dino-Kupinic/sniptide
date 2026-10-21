"use client"

import { ErrorContent } from "@/components/error/error-content"

// The last resort for an uncaught error outside the app shell: the share page, the sign-in screens
// and the landing page. It renders inside the root layout, so translations and the theme work.
// Errors in the root layout itself end up in global-error.tsx.
export default function RootError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <main className="flex min-h-dvh flex-col bg-background dark:bg-sidebar">
      <ErrorContent digest={error.digest} retry={retry} home="/" />
    </main>
  )
}
