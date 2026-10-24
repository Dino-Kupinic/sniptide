"use client"

import { ErrorContent } from "@/components/error/error-content"

// An uncaught error on a signed-in page. It renders inside the app shell, so the sidebar stays and
// the visitor can go elsewhere without a reload.
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <div className="flex h-full flex-col">
      <ErrorContent digest={error.digest} retry={retry} home="/dashboard" />
    </div>
  )
}
