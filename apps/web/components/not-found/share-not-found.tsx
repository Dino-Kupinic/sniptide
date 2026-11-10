import { useTranslations } from "next-intl"
import { ErrorBackdrop } from "@/components/error/error-backdrop"
import { getAppOrigin } from "@/lib/site"
import { NotFoundButton } from "./not-found-button"
import { Pixel404 } from "./pixel-404"

// The 404 for a missing, expired or burned share link, from the Paper marketing "Not found"
// artboards. Share links are served on the marketing domain through a proxy, so every link here
// is a plain <a>, and the sign-in link goes to the app's own origin.
export function ShareNotFound() {
  const t = useTranslations("NotFound")
  const appOrigin = getAppOrigin()

  return (
    <main className="relative isolate flex flex-1 flex-col items-center justify-center overflow-clip px-6 py-10">
      <ErrorBackdrop />
      <div className="relative flex flex-col items-center">
        <Pixel404 className="w-[302px] sm:w-[536px]" />
        <h1 className="mt-6 text-center font-heading text-[34px] leading-[38px] font-bold tracking-[-0.025em] sm:mt-8 sm:text-[44px] sm:leading-[50px]">
          {t("shareHeading")}
        </h1>
        <p className="mt-3 max-w-[460px] text-center text-base leading-[26px] text-balance text-muted-foreground sm:mt-3.5">
          {t("shareDescription")} {t("shareAdvice")}
        </p>
        <div className="mt-7 flex w-full max-w-[440px] flex-col gap-2.5 sm:mt-8 sm:w-auto sm:max-w-none sm:flex-row sm:gap-3">
          <NotFoundButton href="/" external>
            {t("home")}
          </NotFoundButton>
          <NotFoundButton href={`${appOrigin}/new`} outline external>
            {t("createPaste")}
          </NotFoundButton>
        </div>
      </div>
    </main>
  )
}
