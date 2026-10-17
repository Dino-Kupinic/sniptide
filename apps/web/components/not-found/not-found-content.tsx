import { useTranslations } from "next-intl"
import type { ViewerSummary } from "@/lib/viewer"
import { NotFoundButton } from "./not-found-button"
import { Pixel404 } from "./pixel-404"
import { SwitchAccount } from "./switch-account"

// Everything under the header in the Paper "Not found" artboards. Shared by the full-page 404
// (app/not-found.tsx) and the one shown inside the app shell (app/(app)/not-found.tsx).
export function NotFoundContent({ viewer }: { viewer: ViewerSummary | null }) {
  const t = useTranslations("NotFound")
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
      <Pixel404 className="w-[302px] sm:w-[536px]" />
      <h1 className="mt-8 text-center font-heading text-[26px] leading-[30px] font-bold tracking-[-0.01em] sm:mt-10 sm:text-[30px] sm:leading-[34px]">
        {t("heading")}
      </h1>
      <p className="mt-2.5 max-w-[440px] text-center text-[15px] leading-[22px] text-muted-foreground">
        {t("description")}
      </p>

      <div className="mt-6 flex w-full max-w-[440px] flex-col gap-2.5 sm:mt-7 sm:w-auto sm:max-w-none sm:flex-row sm:gap-3">
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
