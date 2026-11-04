import { Avatar, AvatarFallback, AvatarImage } from "@sniptide/ui/components/avatar"
import { Button } from "@sniptide/ui/components/button"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import type { Metadata } from "next"
import { notFound, permanentRedirect } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { currentViewer } from "@/components/not-found/current-viewer"
import { LanguageIcon } from "@/components/paste/language-icon"
import { ActivityGrid } from "@/components/profile/activity-grid"
import { ProfileFilters } from "@/components/profile/profile-filters"
import { PublicHeader } from "@/components/public-header"
import { formatBytes, formatMonthYear, timeAgo } from "@/lib/format"
import { getLanguage } from "@/lib/pastes/languages"
import { profilePath } from "@/lib/profile-path"
import { PROFILE_QUERY_MAX, type ProfileQuery, readProfile } from "@/lib/profiles"
import { getSiteOrigin } from "@/lib/site"

type Props = PageProps<"/_profile/[handle]">
type Search = Awaited<Props["searchParams"]>

// ?page=2 and up, ?q=<search> and ?language=<id>. A page that isn't a whole number is a 404; a
// malformed search or language is ignored.
function queryOf(search: Search): ProfileQuery | null {
  const { page, q, language } = search
  let pageNumber = 1
  if (page !== undefined) {
    if (typeof page !== "string" || !/^[1-9]\d{0,5}$/.test(page)) return null
    pageNumber = Number(page)
  }
  return {
    page: pageNumber,
    q: typeof q === "string" ? q.trim().slice(0, PROFILE_QUERY_MAX) : "",
    language:
      typeof language === "string" && /^[a-z0-9][a-z0-9+#._-]{0,39}$/.test(language)
        ? language
        : undefined,
  }
}

function hrefOf(username: string, query: ProfileQuery) {
  const params = new URLSearchParams()
  if (query.q) params.set("q", query.q)
  if (query.language) params.set("language", query.language)
  if (query.page && query.page > 1) params.set("page", String(query.page))
  const search = params.toString()
  return search ? `${profilePath(username)}?${search}` : profilePath(username)
}

async function load({ params, searchParams }: Props) {
  const [{ handle }, search] = await Promise.all([params, searchParams])
  const query = queryOf(search)
  const profile = query ? await readProfile(handle, query) : null
  return { handle, query, profile }
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { profile } = await load(props)
  if (!profile) return { title: "Sniptide", robots: { index: false, follow: false } }

  const t = await getTranslations("Profile")
  const { origin } = await getSiteOrigin()
  const who = { name: profile.name, handle: profile.displayUsername }
  return {
    title: t("metaTitle", who),
    description: t("metaDescription", who),
    // Searches and filters are views of the same list, so they point at the plain page.
    alternates: { canonical: `${origin}${hrefOf(profile.username, { page: profile.page })}` },
    // Profiles stay out of search results until moderation tooling can act on a whole account.
    // Their public pastes are indexable on their own pages, so crawlers may follow the links.
    robots: { index: false, follow: true },
  }
}

// The public profile at sniptide.com/@<handle> (proxy.ts rewrites it here): who the account is, a
// year of public activity, and the pastes it made public, newest first, with search and a
// language filter. Everything shown is already public on its own link.
export default async function Page(props: Props) {
  const { handle, query, profile } = await load(props)
  if (!profile || !query) notFound()
  if (handle !== profile.username) permanentRedirect(hrefOf(profile.username, query))

  const [viewer, t, locale] = await Promise.all([
    currentViewer(),
    getTranslations("Profile"),
    getLocale(),
  ])
  const now = Date.now()
  const joined = formatMonthYear(profile.joinedAt, locale)
  const filtered = Boolean(profile.q || profile.language)
  const pageLink = (page: number) =>
    hrefOf(profile.username, { page, q: profile.q, language: profile.language ?? undefined })

  return (
    <div className="flex min-h-svh flex-col">
      <PublicHeader signedIn={viewer !== null} />
      <main className="mx-auto flex w-full max-w-[960px] flex-1 flex-col px-4 pt-8 pb-10 lg:pt-14">
        <div className="flex min-w-0 flex-col gap-8 border-b border-border pb-8 lg:gap-10 lg:pb-12">
          <header className="flex min-w-0 items-center gap-4 lg:gap-5">
            <Avatar className="size-16 rounded-lg font-heading text-xl font-bold lg:size-20 lg:text-2xl">
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
          <section aria-labelledby="activity" className="flex min-w-0 flex-col gap-3">
            <h2 id="activity" className="text-sm font-medium">
              {t("activity")}
            </h2>
            <ActivityGrid activity={profile.activity} now={now} />
          </section>
        </div>

        <section aria-labelledby="public-pastes" className="flex flex-col gap-4 pt-8 lg:pt-12">
          <h2
            id="public-pastes"
            className="font-heading text-xl leading-7 font-bold tracking-[-0.02em]"
          >
            {t("pastes", { count: profile.totalAll })}
          </h2>
          {profile.totalAll > 0 ? (
            <ProfileFilters
              path={profilePath(profile.username)}
              q={profile.q}
              language={profile.language}
              languages={profile.languages.map((id) => ({ id, name: getLanguage(id).name }))}
            />
          ) : null}
          {profile.pastes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {filtered ? t("noMatches") : t("empty", { handle: profile.displayUsername })}
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
                  render={<a href={pageLink(profile.page - 1)} />}
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
                  render={<a href={pageLink(profile.page + 1)} />}
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
