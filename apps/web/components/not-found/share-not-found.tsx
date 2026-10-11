import { getAppOrigin } from "@/lib/site"
import { NotFoundButton } from "./not-found-button"
import { Pixel404 } from "./pixel-404"

// The 404 for a missing, expired or burned share link, from the Paper marketing "Not found"
// artboards. Share links are served on the marketing domain through a proxy, so every link here
// is a plain <a>, and the sign-in link goes to the app's own origin.
export function ShareNotFound() {
  const appOrigin = getAppOrigin()

  return (
    <main className="relative flex flex-1 flex-col items-center justify-center overflow-clip px-6 py-10">
      {/* Faint vertical ticks behind the content; decoration only. Masked so they take the
          primary colour, which is lighter in dark mode. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[724px] bg-primary/30 [mask-image:url(/not-found/ticks-mobile.svg)] [mask-repeat:repeat-x] [mask-size:390px_724px] sm:h-[836px] sm:[mask-image:url(/not-found/ticks-desktop.svg)] sm:[mask-size:1440px_836px] dark:bg-primary/85"
      />
      <div className="relative flex flex-col items-center">
        <Pixel404 className="w-[302px] sm:w-[536px]" />
        <h1 className="mt-10 text-center font-heading text-[34px] leading-[38px] font-bold tracking-[-0.025em] sm:mt-12 sm:text-[44px] sm:leading-[50px]">
          This page is gone.
        </h1>
        <p className="mt-3 max-w-[460px] text-center text-[15px] leading-[22px] text-muted-foreground sm:mt-3.5 sm:text-base sm:leading-6">
          The link may have expired, been burned after reading, or never existed.
          <span className="hidden sm:inline"> Check the address, or start a fresh paste.</span>
        </p>
        <div className="mt-7 flex w-full max-w-[440px] flex-col gap-2.5 sm:mt-8 sm:w-auto sm:max-w-none sm:flex-row sm:gap-3">
          <NotFoundButton href="/" external>
            Back to home
          </NotFoundButton>
          <NotFoundButton href={`${appOrigin}/new`} outline external>
            Create a paste
          </NotFoundButton>
        </div>
      </div>
    </main>
  )
}
