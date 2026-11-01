import { ArrowUpRightIcon } from "lucide-react"
import { getTranslations } from "next-intl/server"
import type * as React from "react"
import { getConfig } from "@/lib/config"
import { inlineLinkClass } from "./fields"

// The line under the auth forms that points to the Terms and Privacy Policy. It names only the
// documents this instance links (TERMS_URL, PRIVACY_URL), and is left out when it links neither,
// so a self-hosted server never refers to documents it doesn't have. Both open in a new tab, which
// the arrow after each link says.
export async function LegalNotice({ action }: { action: "signUp" | "continue" }) {
  const { termsUrl, privacyUrl } = getConfig().legal
  if (!termsUrl && !privacyUrl) return null
  const t = await getTranslations("Auth.legal")
  const link = (href: string | undefined) => (children: React.ReactNode) => (
    <a href={href} target="_blank" rel="noopener" className={inlineLinkClass}>
      {children}
      <ArrowUpRightIcon aria-hidden="true" className="ml-0.5 inline size-3 align-[-1px]" />
    </a>
  )
  const key = termsUrl && privacyUrl ? "both" : termsUrl ? "terms" : "privacy"

  return (
    <p className="text-xs text-muted-foreground">
      {t.rich(key, { action, terms: link(termsUrl), privacy: link(privacyUrl) })}
    </p>
  )
}
