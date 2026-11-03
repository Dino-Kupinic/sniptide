"use client"

import { Button } from "@sniptide/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@sniptide/ui/components/dropdown-menu"
import { Sheet, SheetBody, SheetContent, SheetHeader } from "@sniptide/ui/components/sheet"
import { toast } from "@sniptide/ui/components/toast"
import { cn } from "@sniptide/ui/lib/utils"
import {
  BellIcon,
  EyeIcon,
  FlameIcon,
  HourglassIcon,
  type LucideIcon,
  Share2Icon,
  XIcon,
} from "lucide-react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import * as React from "react"
import { Skeleton as MeasuredSkeleton } from "skullet/react"
import { timeAgo } from "@/lib/format"
import { dismiss, markAllRead, markRead } from "@/lib/notifications/actions"
import { NotificationReader } from "@/lib/notifications/reader"
import {
  NOTIFICATION_POLL_MS,
  type NotificationFeed,
  type NotificationKind,
} from "@/lib/notifications/types"

const icons: Record<NotificationKind, LucideIcon> = {
  shared: Share2Icon,
  burned: FlameIcon,
  expiring: HourglassIcon,
  views: EyeIcon,
}

type Feed = NotificationFeed | "error" | null

interface Notifications {
  feed: Feed
  unread: number
  load: () => Promise<void>
  markOne: (id: string) => void
  remove: (id: string) => void
  markAll: () => void
}

const NotificationsContext = React.createContext<Notifications | null>(null)

function useNotifications() {
  const value = React.useContext(NotificationsContext)
  if (!value) throw new Error("useNotifications needs a NotificationsProvider")
  return value
}

// The account's notifications from /api/notifications, shared by the desktop bell and the mobile
// one so only one copy polls. It asks again every 30 seconds while the page is in view, when the
// tab comes back into view and whenever a bell opens, so new ones appear without a reload.
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const locale = useLocale()
  const t = useTranslations("Workspace")
  const [feed, setFeed] = React.useState<Feed>(null)
  const currentLocale = React.useRef(locale)
  currentLocale.current = locale
  const [reader] = React.useState(
    () =>
      new NotificationReader({
        async read() {
          const response = await fetch("/api/notifications", {
            cache: "no-store",
            headers: { "accept-language": currentLocale.current },
          })
          if (!response.ok) throw new Error(String(response.status))
          return (await response.json()) as NotificationFeed
        },
        publish: setFeed,
        failed: () => setFeed((current) => (current === null ? "error" : current)),
      }),
  )
  const load = React.useCallback(() => reader.load(), [reader])

  React.useEffect(() => {
    reader.invalidate()
    void load()
    const poll = () => {
      if (document.visibilityState === "visible") void load()
    }
    const timer = window.setInterval(poll, NOTIFICATION_POLL_MS)
    document.addEventListener("visibilitychange", poll)
    window.addEventListener("focus", poll)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", poll)
      window.removeEventListener("focus", poll)
      reader.invalidate()
    }
  }, [load, locale, reader])

  const loaded = typeof feed === "object" && feed !== null ? feed : null
  const unread = loaded?.unread ?? 0

  // Marks locally first, so the badge and the list answer right away, then tells the server and
  // asks for the real state.
  function mark(
    change: (current: NotificationFeed) => NotificationFeed,
    save: () => Promise<{ ok: boolean }>,
  ) {
    setFeed((current) =>
      typeof current === "object" && current !== null ? change(current) : current,
    )
    reader
      .mutate(async () => {
        const result = await save()
        if (!result.ok) throw new Error("not saved")
      })
      .catch(() => {
        toast.error(t("couldnt_update_notifications_try_again"))
      })
  }

  const markOne = (id: string) =>
    mark(
      (current) => {
        const target = current.items.find((item) => item.id === id)
        if (!target || target.read) return current
        return {
          unread: Math.max(0, current.unread - 1),
          items: current.items.map((item) => (item.id === id ? { ...item, read: true } : item)),
        }
      },
      () => markRead(id),
    )

  const remove = (id: string) =>
    mark(
      (current) => {
        const target = current.items.find((item) => item.id === id)
        if (!target) return current
        return {
          unread: target.read ? current.unread : Math.max(0, current.unread - 1),
          items: current.items.filter((item) => item.id !== id),
        }
      },
      () => dismiss(id),
    )

  const markAll = () =>
    mark(
      (current) => ({ unread: 0, items: current.items.map((item) => ({ ...item, read: true })) }),
      markAllRead,
    )

  return (
    <NotificationsContext value={{ feed, unread, load, markOne, remove, markAll }}>
      {children}
    </NotificationsContext>
  )
}

function UnreadBadge({ unread }: { unread: number }) {
  if (unread === 0) return null
  return (
    <span
      aria-hidden="true"
      className="absolute top-0.5 right-0.5 flex h-4 min-w-4 rounded-sm items-center justify-center bg-primary px-1 text-[10px] leading-none font-medium text-primary-foreground tabular-nums"
    >
      {unread > 9 ? "9+" : unread}
    </span>
  )
}

// The bell in the desktop top bar. Opening one goes to its page and marks it read.
export function NotificationsMenu({ className }: { className?: string }) {
  const locale = useLocale()
  const t = useTranslations("Workspace")
  const { feed, unread, load, markOne, remove, markAll } = useNotifications()
  const [open, setOpen] = React.useState(false)
  const loaded = typeof feed === "object" && feed !== null ? feed : null

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) void load()
      }}
    >
      <DropdownMenuTrigger
        aria-label={unread > 0 ? t("notifications_unread", { count: unread }) : t("notifications")}
        className={cn("relative data-popup-open:bg-muted", className)}
      >
        <BellIcon />
        <UnreadBadge unread={unread} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex h-10 items-center justify-between border-b border-border px-3">
          <span className="text-sm font-medium">{t("notifications")}</span>
          <button
            type="button"
            disabled={unread === 0}
            onClick={markAll}
            className="text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:underline disabled:opacity-50"
          >
            {t("mark_all_as_read")}
          </button>
        </div>
        {loaded && loaded.items.length > 0 ? (
          <div className="max-h-96 overflow-y-auto py-1">
            {loaded.items.map((item) => {
              const Icon = icons[item.kind]
              return (
                // The x sits beside the row's link rather than inside it, and only shows on hover
                // or focus (always on touch screens).
                <div key={item.id} className="group/notification relative">
                  <DropdownMenuItem
                    render={<Link href={item.href} />}
                    onClick={() => markOne(item.id)}
                    // Full-width rows: the list runs edge to edge, so these skip the inset menu highlight.
                    className="h-auto items-start gap-2.5 rounded-none py-2.5 pr-10"
                  >
                    <Icon className="mt-0.5" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className={cn("break-words", !item.read && "font-medium")}>
                        {item.title}
                      </span>
                      <span className="text-xs text-muted-foreground">{item.detail}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                      {timeAgo(item.createdAt, undefined, locale)}
                      <span
                        aria-hidden="true"
                        className={cn("size-1.5", item.read ? "bg-transparent" : "bg-primary")}
                      />
                      {item.read ? null : <span className="sr-only">{t("unread")}</span>}
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    closeOnClick={false}
                    aria-label={t("remove_notification", { title: item.title })}
                    onClick={() => remove(item.id)}
                    className="absolute top-2 right-2 size-6 justify-center rounded-md px-0 opacity-0 group-hover/notification:opacity-100 data-highlighted:opacity-100 [@media(hover:none)]:opacity-100 [&_svg]:size-3.5"
                  >
                    <XIcon />
                  </DropdownMenuItem>
                </div>
              )
            })}
          </div>
        ) : (
          <Placeholder feed={feed} retry={() => void load()} />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// The bell in the mobile top bar. The feed opens as a bottom sheet, with rows big enough to tap
// and the remove button always showing.
export function NotificationsSheet() {
  const locale = useLocale()
  const t = useTranslations("Workspace")
  const { feed, unread, load, markOne, remove, markAll } = useNotifications()
  const [open, setOpen] = React.useState(false)
  const loaded = typeof feed === "object" && feed !== null ? feed : null

  return (
    <>
      <Button
        variant="outline"
        size="icon-lg"
        aria-label={unread > 0 ? t("notifications_unread", { count: unread }) : t("notifications")}
        onClick={() => {
          setOpen(true)
          void load()
        }}
        className="relative"
      >
        <BellIcon />
        <UnreadBadge unread={unread} />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom">
          <SheetHeader title={t("notifications")} closeLabel={t("close")}>
            <Button variant="ghost" size="lg" disabled={unread === 0} onClick={markAll}>
              {t("mark_all_as_read")}
            </Button>
          </SheetHeader>
          <SheetBody className="px-0">
            {loaded && loaded.items.length > 0 ? (
              <ul className="flex flex-col">
                {loaded.items.map((item) => {
                  const Icon = icons[item.kind]
                  return (
                    <li
                      key={item.id}
                      className="flex items-start border-b border-border px-2 last:border-b-0"
                    >
                      <Link
                        href={item.href}
                        onClick={() => {
                          markOne(item.id)
                          setOpen(false)
                        }}
                        className="flex min-w-0 flex-1 items-start gap-3 rounded-md px-2 py-3 outline-none active:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40"
                      >
                        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className={cn("text-sm break-words", !item.read && "font-medium")}>
                            {item.title}
                          </span>
                          <span className="text-[13px] text-muted-foreground">{item.detail}</span>
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                            {timeAgo(item.createdAt, undefined, locale)}
                            {item.read ? null : (
                              <>
                                <span aria-hidden="true" className="size-1.5 bg-primary" />
                                <span className="sr-only">{t("unread")}</span>
                              </>
                            )}
                          </span>
                        </span>
                      </Link>
                      <button
                        type="button"
                        aria-label={t("remove_notification", { title: item.title })}
                        onClick={() => remove(item.id)}
                        className="mt-1 inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40"
                      >
                        <XIcon className="size-4" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <Placeholder feed={feed} retry={() => void load()} />
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  )
}

function Placeholder({ feed, retry }: { feed: Feed; retry: () => void }) {
  const t = useTranslations("Workspace")
  if (feed === "error") {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
        <p className="text-sm font-medium">{t("couldnt_load_notifications")}</p>
        <button
          type="button"
          onClick={retry}
          className="text-xs text-muted-foreground underline outline-none hover:text-foreground"
        >
          {t("try_again")}
        </button>
      </div>
    )
  }
  if (feed === null) {
    return (
      <MeasuredSkeleton
        className="loading-feedback-measured min-h-[104px] min-w-0 overflow-hidden"
        loading
        label={t("loading")}
      >
        <div className="flex min-h-[104px] items-center gap-2.5 px-4 py-3">
          <BellIcon className="size-4 shrink-0" />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-sm font-medium">{t("notifications")}</span>
            <span className="line-clamp-2 text-xs text-muted-foreground">
              {t("shares_pastes_that_burned_after_reading_expiring_pastes")}
            </span>
          </span>
        </div>
      </MeasuredSkeleton>
    )
  }
  return (
    <div className="flex flex-col items-center gap-1 px-4 py-8 text-center">
      <p className="text-sm font-medium">{t("youre_all_caught_up")}</p>
      <p className="text-xs text-muted-foreground">
        {t("shares_pastes_that_burned_after_reading_expiring_pastes")}
      </p>
    </div>
  )
}
