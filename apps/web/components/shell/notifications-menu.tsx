"use client"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@sniptide/ui/components/dropdown-menu"
import { toast } from "@sniptide/ui/components/toast"
import { cn } from "@sniptide/ui/lib/utils"
import {
  BellIcon,
  EyeIcon,
  FlameIcon,
  HourglassIcon,
  type LucideIcon,
  Share2Icon,
} from "lucide-react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import * as React from "react"
import { timeAgo } from "@/lib/format"
import { markAllRead, markRead } from "@/lib/notifications/actions"
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

// The bell in the top bar: the account's notifications from /api/notifications. It asks again
// every 30 seconds while the page is in view, when the tab comes back into view and whenever the
// menu opens, so new ones appear without a reload. Opening one goes to its page and marks it read.
export function NotificationsMenu({ className }: { className?: string }) {
  const locale = useLocale()
  const t = useTranslations("Workspace")
  const [feed, setFeed] = React.useState<Feed>(null)
  const [open, setOpen] = React.useState(false)
  // Only the newest answer counts, so a slow earlier request can't undo a mark-as-read.
  const latest = React.useRef(0)

  const load = React.useCallback(async () => {
    const id = ++latest.current
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" })
      if (!response.ok) throw new Error(String(response.status))
      const next = (await response.json()) as NotificationFeed
      if (id === latest.current) setFeed(next)
    } catch {
      // Keep showing what we have; only a bell that never loaded reports the failure.
      if (id === latest.current) setFeed((current) => (current === null ? "error" : current))
    }
  }, [locale])

  React.useEffect(() => {
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
    }
  }, [load])

  const loaded = typeof feed === "object" && feed !== null ? feed : null
  const unread = loaded?.unread ?? 0

  // Marks locally first, so the badge and the list answer right away, then tells the server and
  // asks for the real state.
  function mark(
    change: (current: NotificationFeed) => NotificationFeed,
    save: () => Promise<{ ok: boolean }>,
  ) {
    latest.current++
    setFeed((current) =>
      typeof current === "object" && current !== null ? change(current) : current,
    )
    save()
      .then((result) => {
        if (!result.ok) throw new Error("not saved")
        return load()
      })
      .catch(() => {
        toast.error(t("couldnt_update_notifications_try_again"))
        void load()
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

  const markAll = () =>
    mark(
      (current) => ({ unread: 0, items: current.items.map((item) => ({ ...item, read: true })) }),
      markAllRead,
    )

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
        {unread > 0 ? (
          <span
            aria-hidden="true"
            className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center bg-primary px-1 text-[10px] leading-none font-medium text-primary-foreground tabular-nums"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 py-0">
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
                <DropdownMenuItem
                  key={item.id}
                  render={<Link href={item.href} />}
                  onClick={() => markOne(item.id)}
                  className="h-auto items-start gap-2.5 py-2.5"
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
      <p role="status" className="px-4 py-8 text-center text-sm text-muted-foreground">
        {t("loading")}
      </p>
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
