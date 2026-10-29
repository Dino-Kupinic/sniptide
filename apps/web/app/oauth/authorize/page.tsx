import { Button } from "@sniptide/ui/components/button"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { AuthScreen } from "@/components/auth/auth-screen"
import { authSubmitClass } from "@/components/auth/fields"
import { LegalNotice } from "@/components/auth/legal-notice"
import { ConsentForm } from "@/components/oauth/consent-form"
import { getSession } from "@/lib/auth"
import { checkAuthorization } from "@/lib/oauth/grants"
import { oauthPaths } from "@/lib/oauth/metadata"
import { pageOrigin } from "@/lib/oauth/origin"

export async function generateMetadata() {
  const t = await getTranslations("OAuth")
  return { title: t("metaTitle"), robots: { index: false } }
}

// The consent screen of the OAuth flow (lib/oauth). The client and its redirect URI are checked
// first: when either is wrong the error is shown here, because sending it back could hand it to
// whoever forged the link. Other errors go back to the client. Approving posts to
// /api/oauth/authorize, which checks everything again before it issues a code.
export default async function Page({ searchParams }: PageProps<"/oauth/authorize">) {
  const [t, query, origin] = await Promise.all([
    getTranslations("OAuth"),
    searchParams,
    pageOrigin(),
  ])
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    // A repeated parameter is ambiguous, so it counts as missing (RFC 6749 3.1).
    if (typeof value === "string") params.set(key, value)
  }
  const host = new URL(origin).host
  const pitch = {
    title: [t("pitchTitle1"), t("pitchTitle2")] as [string, string],
    body: t("pitchBody"),
    link: `${host}/api/mcp`,
    note: t("pitchNote"),
  }

  const check = await checkAuthorization(params, `${origin}${oauthPaths.authorization}`)
  if (!check.ok && check.redirect) redirect(check.redirect)
  if (!check.ok)
    return (
      <AuthScreen
        title={t("invalidTitle")}
        subtitle={t(check.error === "invalid_client" ? "invalidClient" : "invalidRedirect")}
        legal={null}
        pitch={pitch}
      >
        {null}
      </AuthScreen>
    )

  const session = await getSession()
  if (!session)
    redirect(`/sign-in?next=${encodeURIComponent(`${oauthPaths.authorization}?${params}`)}`)

  const { request } = check
  const client = request.client.name
  const redirectHost = new URL(request.redirectUri).host || new URL(request.redirectUri).protocol
  return (
    <AuthScreen
      title={t("title", { client })}
      subtitle={t("subtitle", { client })}
      legal={<LegalNotice action="continue" />}
      pitch={pitch}
    >
      <ConsentForm className="flex flex-col gap-5 lg:gap-6">
        {[...params].map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
        <ul className="rounded-lg flex flex-col divide-y divide-border border border-border">
          {request.scopes.map((scope) => (
            <li key={scope} className="px-3 py-2.5 text-sm">
              {t(scope)}
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>{t("redirectNotice", { client, host: redirectHost })}</p>
          <p>{t("revokeNotice")}</p>
          <p>{t("signedInAs", { email: session.user.email })}</p>
        </div>
        <div className="flex flex-col gap-2">
          <Button type="submit" name="decision" value="allow" size="xl" className={authSubmitClass}>
            {t("allow")}
          </Button>
          <Button
            type="submit"
            name="decision"
            value="deny"
            variant="outline"
            size="xl"
            className={authSubmitClass}
          >
            {t("deny")}
          </Button>
        </div>
      </ConsentForm>
    </AuthScreen>
  )
}
