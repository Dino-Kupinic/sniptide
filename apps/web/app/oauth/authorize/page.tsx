import { Button } from "@sniptide/ui/components/button"
import { LogoMark } from "@sniptide/ui/components/logo"
import {
  CircleUserIcon,
  CornerDownLeftIcon,
  EyeIcon,
  PencilIcon,
  TriangleAlertIcon,
  UnplugIcon,
} from "lucide-react"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type * as React from "react"
import { AuthScreen } from "@/components/auth/auth-screen"
import { authSubmitClass } from "@/components/auth/fields"
import { LegalNotice } from "@/components/auth/legal-notice"
import { ConsentForm } from "@/components/oauth/consent-form"
import { AgentLogo } from "@/components/onboarding/agent-logos"
import { getSession } from "@/lib/auth"
import { checkAuthorization } from "@/lib/oauth/grants"
import { oauthPaths } from "@/lib/oauth/metadata"
import { pageOrigin } from "@/lib/oauth/origin"
import { agentClientFromName } from "@/lib/onboarding"

const SCOPE_ICONS = { read: EyeIcon, write: PencilIcon }

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
        mark={
          <Tile>
            <TriangleAlertIcon aria-hidden className="size-5 text-destructive" />
          </Tile>
        }
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
  const mono = (chunks: React.ReactNode) => (
    <span className="font-mono text-[13px] text-foreground">{chunks}</span>
  )
  const strong = (chunks: React.ReactNode) => (
    <span className="font-medium text-foreground">{chunks}</span>
  )

  return (
    <AuthScreen
      title={t("title", { client })}
      subtitle={t("subtitle", { client })}
      mark={
        <div className="flex items-center gap-2">
          <Tile>
            <AgentLogo client={agentClientFromName(client)} className="size-5" />
          </Tile>
          <span aria-hidden className="w-6 border-t-2 border-dotted border-border" />
          <Tile>
            <LogoMark className="h-5 w-[20.75px]" />
          </Tile>
        </div>
      }
      mobilePitch={false}
      legal={<LegalNotice action="continue" />}
      pitch={pitch}
    >
      <ConsentForm className="flex flex-col gap-5 lg:gap-6">
        {[...params].map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
        <ul
          aria-label={t("scopesLabel", { client })}
          className="rounded-lg flex flex-col divide-y divide-border border border-border"
        >
          {request.scopes.map((scope) => {
            const Icon = SCOPE_ICONS[scope]
            return (
              <li key={scope} className="flex min-w-0 gap-3 px-3 py-2.5 text-sm leading-5">
                <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">{t(scope)}</span>
              </li>
            )
          })}
        </ul>
        <ul className="flex flex-col gap-3 text-sm leading-5 text-muted-foreground">
          <Note icon={CircleUserIcon}>
            {t.rich("signedInAs", { email: session.user.email, strong })}
          </Note>
          <Note icon={CornerDownLeftIcon}>
            {t.rich("redirectNotice", { client, host: redirectHost, mono })}
          </Note>
          <Note icon={UnplugIcon}>{t("revokeNotice")}</Note>
        </ul>
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

// A 40px square that holds one logo or icon above the heading.
function Tile({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-lg flex size-10 shrink-0 items-center justify-center border border-border bg-background">
      {children}
    </span>
  )
}

// One line under the scopes, with its icon, in the style of the agent setup steps.
function Note({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  children: React.ReactNode
}) {
  return (
    <li className="flex min-w-0 gap-3">
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    </li>
  )
}
