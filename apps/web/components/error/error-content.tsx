"use client"

import { Button } from "@sniptide/ui/components/button"
import { useTranslations } from "next-intl"
import { NotFoundButton } from "@/components/not-found/not-found-button"

// What an uncaught error shows (app/error.tsx and app/(app)/error.tsx), in the layout of the 404 without its illustration.
// `retry` renders the segment again, which clears errors that were only a bad moment, such as a
// dropped database connection. The digest is the id the server logged the error under.
export function ErrorContent({
  digest,
  retry,
  home,
}: {
  digest?: string
  retry: () => void
  home: "/" | "/dashboard"
}) {
  const t = useTranslations("ServerError")
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
      <title>{t("title")}</title>
      <h1 className="text-center font-heading text-[26px] leading-[30px] font-bold tracking-[-0.01em] sm:text-[30px] sm:leading-[34px]">
        {t("heading")}
      </h1>
      <p className="mt-2.5 max-w-[440px] text-center text-[15px] leading-[22px] text-muted-foreground">
        {t("description")}
      </p>

      <div className="mt-6 flex w-full max-w-[440px] flex-col gap-2.5 sm:mt-7 sm:w-auto sm:max-w-none sm:flex-row sm:gap-3">
        <Button className="h-12 px-[22px] text-[15px] sm:h-11 sm:text-sm" onClick={() => retry()}>
          {t("retry")}
        </Button>
        <NotFoundButton href={home} outline>
          {home === "/" ? t("home") : t("dashboard")}
        </NotFoundButton>
      </div>

      {digest ? (
        <span className="mt-5 font-mono text-xs leading-4 text-muted-foreground sm:mt-[22px]">
          {t("reference", { digest })}
        </span>
      ) : null}
    </div>
  )
}
