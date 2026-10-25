import { cn } from "@sniptide/ui/lib/utils"
import { getLanguage } from "@/lib/pastes/languages"

// The language's logo, served from public/languages so a list only downloads the logos it shows
// (and a scrolled menu only the ones in view). A logo drawn for dark backgrounds has a light
// variant, and the theme class picks one.
export function LanguageIcon({ language, className }: { language: string; className?: string }) {
  const { icon, iconLight } = getLanguage(language)
  const image = (src: string, variant?: string) => (
    <img
      src={src}
      alt=""
      width={16}
      height={16}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={cn("size-full select-none", variant)}
    />
  )
  return (
    <span aria-hidden="true" className={cn("inline-flex size-4 shrink-0", className)}>
      {iconLight ? (
        <>
          {image(`/languages/${icon}-light.svg`, "dark:hidden")}
          {image(`/languages/${icon}.svg`, "hidden dark:block")}
        </>
      ) : (
        image(`/languages/${icon}.svg`)
      )}
    </span>
  )
}

export function LanguageLabel({ language, className }: { language: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LanguageIcon language={language} />
      {getLanguage(language).name}
    </span>
  )
}
