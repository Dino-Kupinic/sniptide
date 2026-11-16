import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { PublicHeader } from "@/components/public-header"
import { getConfig } from "@/lib/config"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Abuse")
  return { title: t("title"), robots: { index: false, follow: false }, referrer: "same-origin" }
}

export default async function Page({ searchParams }: PageProps<"/abuse">) {
  if (!getConfig().abuseReportsEnabled) notFound()
  const t = await getTranslations("Abuse")
  const query = await searchParams
  const state =
    typeof query.status === "string" &&
    ["received", "invalid", "failed", "limited"].includes(query.status)
      ? query.status
      : null
  return (
    <div className="flex min-h-svh flex-col">
      <PublicHeader signedIn={false} />
      <main className="mx-auto flex w-full max-w-[560px] flex-col gap-6 px-4 py-10 lg:py-16">
        <h1 className="font-heading text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-sm leading-6 text-muted-foreground">{t("instructions")}</p>
        <p className="text-sm leading-6">{t("privacy")}</p>
        {state ? (
          <p role="status" className="rounded-md border border-border p-4 text-sm">
            {t(state)}
          </p>
        ) : null}
        {state === "received" ? null : (
          <form action="/api/abuse" method="post" className="flex flex-col gap-5">
            <label className="flex flex-col gap-2 text-sm font-medium">
              {t("url")}
              <input
                className="rounded-md border border-input bg-background p-3 font-normal"
                name="url"
                type="url"
                required
                maxLength={2048}
                autoComplete="off"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium">
              {t("category")}
              <select
                name="category"
                defaultValue="other"
                required
                className="rounded-md border border-input bg-background p-3 font-normal"
              >
                <option value="child_exploitation">{t("child_exploitation")}</option>
                <option value="sexual_content">{t("sexual_content")}</option>
                <option value="graphic_violence">{t("graphic_violence")}</option>
                <option value="malware">{t("malware")}</option>
                <option value="harassment">{t("harassment")}</option>
                <option value="other">{t("other")}</option>
                <option value="appeal">{t("appeal")}</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium">
              {t("explanation")}
              <textarea
                name="explanation"
                required
                minLength={10}
                maxLength={2000}
                rows={4}
                className="rounded-md border border-input bg-background p-3 font-normal"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium">
              {t("contact")}
              <input
                name="contact"
                type="email"
                maxLength={254}
                className="rounded-md border border-input bg-background p-3 font-normal"
              />
            </label>
            <button
              className="rounded-md bg-primary p-3 text-sm font-medium text-primary-foreground"
              type="submit"
            >
              {t("submit")}
            </button>
          </form>
        )}
      </main>
    </div>
  )
}
