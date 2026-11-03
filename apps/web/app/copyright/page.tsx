import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { PublicHeader } from "@/components/public-header"
import { getSession } from "@/lib/auth"
import { getConfig } from "@/lib/config"
import { getSiteOrigin } from "@/lib/site"

// How to send a copyright (DMCA) takedown notice or counter-notice. Published only when
// COPYRIGHT_EMAIL is set; OPERATOR_NAME and OPERATOR_ADDRESS name the designated agent. Served on
// the share domain too, next to the pastes it is about.

async function operatorName() {
  return getConfig().legal.operator?.name ?? (await getSiteOrigin()).host
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Copyright")
  return {
    title: `${t("title")} · Sniptide`,
    description: t("description", { operator: await operatorName() }),
  }
}

export default async function Page() {
  const { copyrightEmail, operator } = getConfig().legal
  if (!copyrightEmail) notFound()
  const [t, session, name] = await Promise.all([
    getTranslations("Copyright"),
    getSession(),
    operatorName(),
  ])
  const notice = [1, 2, 3, 4, 5, 6] as const

  return (
    <div className="flex min-h-svh flex-col">
      <PublicHeader signedIn={Boolean(session)} />
      <main className="mx-auto flex w-full max-w-[560px] flex-col gap-8 px-4 py-10 lg:py-16">
        <div className="flex flex-col gap-3">
          <h1 className="font-heading text-3xl leading-9 font-bold tracking-[-0.02em]">
            {t("title")}
          </h1>
          <p className="text-base leading-[26px] text-muted-foreground">
            {t("intro", { operator: name })}
          </p>
        </div>

        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-xl leading-7 font-bold tracking-[-0.02em]">
            {t("agentHeading")}
          </h2>
          <address className="text-sm leading-5 whitespace-pre-line not-italic">
            {operator ? <span className="block font-medium">{operator.name}</span> : null}
            {operator?.address ? <span className="block">{operator.address}</span> : null}
            <a
              href={`mailto:${copyrightEmail}`}
              className="text-link underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {copyrightEmail}
            </a>
          </address>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-xl leading-7 font-bold tracking-[-0.02em]">
            {t("noticeHeading")}
          </h2>
          <p className="text-sm leading-5">{t("noticeIntro")}</p>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm leading-5">
            {notice.map((item) => (
              <li key={item}>{t(`notice${item}`)}</li>
            ))}
          </ol>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-xl leading-7 font-bold tracking-[-0.02em]">
            {t("counterHeading")}
          </h2>
          <p className="text-sm leading-5">{t("counterBody")}</p>
        </section>

        <div className="flex flex-col gap-2 text-sm leading-5 text-muted-foreground">
          <p>{t("repeat")}</p>
          <p>{t("falseClaims")}</p>
        </div>
      </main>
    </div>
  )
}
