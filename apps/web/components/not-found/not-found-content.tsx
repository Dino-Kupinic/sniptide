import { useTranslations } from "next-intl"
import { ErrorBackdrop } from "@/components/error/error-backdrop"
import type { ViewerSummary } from "@/lib/viewer"
import { NotFoundButton } from "./not-found-button"
import { Pixel404 } from "./pixel-404"
import { SwitchAccount } from "./switch-account"

// Everything under the header in the Paper "Not found" artboards. Shared by the full-page 404
// (app/not-found.tsx) and the one shown inside the app shell (app/(app)/not-found.tsx).
export function NotFoundContent({ viewer }: { viewer: ViewerSummary | null }) {
  const t = useTranslations("NotFound")
  return (
    <div className="relative isolate flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-10">
      <ErrorBackdrop />
      <Pixel404 className="w-[302px] sm:w-[536px]" />
      <h1 className="mt-6 text-center font-heading text-[26px] leading-8 font-bold tracking-[-0.02em] sm:mt-8 sm:text-3xl sm:leading-9">
        {t("heading")}
      </h1>
      <p className="mt-3 max-w-[460px] text-center text-base leading-[26px] text-balance text-muted-foreground">
        {t("description")}
      </p>

      <div className="mt-7 flex w-full max-w-[440px] flex-col gap-2.5 sm:mt-8 sm:w-auto sm:max-w-none sm:flex-row sm:gap-3">
        {viewer ? (
          <>
            <NotFoundButton href="/dashboard">{t("dashboard")}</NotFoundButton>
            <NotFoundButton href="/trash" outline>
              {t("trash")}
            </NotFoundButton>
          </>
        ) : (
          <NotFoundButton href="/sign-in">{t("signIn")}</NotFoundButton>
        )}
      </div>

      {viewer ? (
        <div className="mt-5 flex flex-col items-center gap-1 sm:mt-[22px] sm:flex-row sm:gap-2">
          <span className="font-mono text-xs leading-4 text-muted-foreground">
            {t("signedInAs", { email: viewer.email })}
          </span>
          <SwitchAccount />
        </div>
      ) : null}
    </div>
  )
}
