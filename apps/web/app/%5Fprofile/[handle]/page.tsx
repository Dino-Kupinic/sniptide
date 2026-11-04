import { Avatar, AvatarFallback, AvatarImage } from "@sniptide/ui/components/avatar"
import { Button } from "@sniptide/ui/components/button"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import type { Metadata } from "next"
import { notFound, permanentRedirect } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { currentViewer } from "@/components/not-found/current-viewer"
import { LanguageIcon } from "@/components/paste/language-icon"
import { PublicHeader } from "@/components/public-header"
import { formatBytes, formatMonthYear, timeAgo } from "@/lib/format"
import { profilePath } from "@/lib/profile-path"
import { readProfile } from "@/lib/profiles"
import { getSiteOrigin } from "@/lib/site"

type Props = PageProps<"/_profile/[handle]">

// ?page=2 and up; anything else that isn't a whole page number is a 404.
function pageOf(value: string | string[] | undefined) {
  if (value === undefined) return 1
  if (typeof value !== "string" || !/^[1-9]\d{0,5}$/.test(value)) return null
  return Number(value)
}

function pageHref(username: string, page: number) {
  return page > 1 ? `${profilePath(username)}?page=${page}` : profilePath(username)
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ handle }, query] = await Promise.all([params, searchParams])
  const page = pageOf(query.page)
  const profile = page ? await readProfile(handle, page) : null
  if (!profile) return { title: "Sniptide", robots: { index: false, follow: false } }

  const t = await getTranslations("Profile")
  const { origin } = await getSiteOrigin()
  const who = { name: profile.name, handle: profile.displayUsername }
  return {
    title: t("metaTitle", who),
    description: t("metaDescription", who),
    alternates: { canonical: `${origin}${pageHref(profile.username, profile.page)}` },
    // Profiles stay out of search results until moderation tooling can act on a whole account.
    // Their public pastes are indexable on their own pages, so crawlers may follow the links.
    robots: { index: false, follow: true },
  }
}

// The public profile at sniptide.com/@<handle> (proxy.ts rewrites it here): who the account is and
// the pastes it made public, newest first. Everything shown is already public on its own link.
export default async function Page({ params, searchParams }: Props) {
  const [{ handle }, query] = await Promise.all([params, searchParams])
  const page = pageOf(query.page)
  const profile = page ? await readProfile(handle, page) : null
  if (!profile) notFound()
  if (handle !== profile.username) permanentRedirect(pageHref(profile.username, profile.page))

  const [viewer, t, locale] = await Promise.all([
    currentViewer(),
    getTranslations("Profile"),
    getLocale(),
  ])
  const now = Date.now()
  const joined = formatMonthYear(profile.joinedAt, locale)

  return (
    <div className="flex min-h-svh flex-col">
      <PublicHeader signedIn={viewer !== null} />
      <main className="mx-auto flex w-full max-w-[960px] flex-1 flex-col gap-8 px-4 pt-6 pb-10 lg:gap-10 lg:pt-12">
        <header className="flex min-w-0 items-center gap-4">
          <Avatar className="size-16 rounded-lg font-heading text-xl font-bold">
            {profile.image ? <AvatarImage src={profile.image} alt="" /> : null}
            <AvatarFallback>{profile.initials}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="font-heading text-[30px] leading-9 font-bold tracking-[-0.02em] break-words">
              {profile.name}
            </h1>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span className="font-mono text-foreground">@{profile.displayUsername}</span>
              <span>{t("joined", { date: joined })}</span>
            </p>
          </div>
        </header>

        <section aria-labelledby="public-pastes" className="flex flex-col gap-3">
          <h2
            id="public-pastes"
            className="font-heading text-xl leading-7 font-bold tracking-[-0.02em]"
          >
            {t("pastes", { count: profile.total })}
          </h2>
          {profile.pastes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("empty", { handle: profile.displayUsername })}
            </p>
          ) : (
            <ul className="flex flex-col border-t border-border">
              {profile.pastes.map((paste) => (
                <li
                  key={paste.slug}
                  className="relative flex min-w-0 items-center gap-3 border-b border-border py-3"
                >
                  <LanguageIcon language={paste.language} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    {/* The whole row opens the paste; a plain <a>, since this page can be served
                        on the share domain (see getAppOrigin). */}
                    <a
                      href={`/${paste.slug}`}
                      title={paste.title}
                      className="truncate text-[15px] font-medium outline-none after:absolute after:inset-0 focus-visible:underline"
                    >
                      {paste.title}
                    </a>
                    <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="min-w-0 truncate font-mono">{paste.slug}</span>
                      <span aria-hidden="true">·</span>
                      <span className="shrink-0">{formatBytes(paste.bytes, locale)}</span>
                    </span>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {timeAgo(paste.createdAt, now, locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {profile.pageCount > 1 ? (
            <nav aria-label={t("pagination")} className="flex items-center justify-between gap-3">
              {profile.page > 1 ? (
                <Button
                  variant="outline"
                  render={<a href={pageHref(profile.username, profile.page - 1)} />}
                  nativeButton={false}
                >
                  <ChevronLeftIcon />
                  {t("newer")}
                </Button>
              ) : (
                <span />
              )}
              <span className="text-[13px] text-muted-foreground tabular-nums">
                {t("pageOf", { page: profile.page, count: profile.pageCount })}
              </span>
              {profile.page < profile.pageCount ? (
                <Button
                  variant="outline"
                  render={<a href={pageHref(profile.username, profile.page + 1)} />}
                  nativeButton={false}
                >
                  {t("older")}
                  <ChevronRightIcon />
                </Button>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </section>
      </main>
    </div>
  )
}
