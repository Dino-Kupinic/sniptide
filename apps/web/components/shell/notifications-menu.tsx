"use client"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@sniptide/ui/components/dropdown-menu"
import { cn } from "@sniptide/ui/lib/utils"
import { BellIcon, EyeIcon, FlameIcon, HourglassIcon, type LucideIcon } from "lucide-react"
import * as React from "react"

// The bell in the top bar. Notifications aren't built yet, so this shows example entries to settle
// the dropdown's look; they don't come from the account.
interface Notice {
  id: string
  icon: LucideIcon
  title: string
  detail: string
  time: string
}

const examples: Notice[] = [
  {
    id: "views",
    icon: EyeIcon,
    title: "nginx reverse proxy is getting views",
    detail: "24 views in the last hour",
    time: "12m",
  },
  {
    id: "expiring",
    icon: HourglassIcon,
    title: "deployment.yaml expires tomorrow",
    detail: "Extend it from the paste's sharing panel",
    time: "2h",
  },
  {
    id: "burned",
    icon: FlameIcon,
    title: "checkout-500 stack trace was read",
    detail: "It burned after reading and is gone",
    time: "1d",
  },
]

export function NotificationsMenu({ className }: { className?: string }) {
  const [unread, setUnread] = React.useState(() => new Set(["views", "expiring"]))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={unread.size > 0 ? `Notifications, ${unread.size} unread` : "Notifications"}
        className={cn("relative data-popup-open:bg-muted", className)}
      >
        <BellIcon />
        {unread.size > 0 ? (
          <span aria-hidden="true" className="absolute top-1.5 right-1.5 size-1.5 bg-primary" />
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 py-0">
        <div className="flex h-10 items-center justify-between border-b border-border px-3">
          <span className="text-sm font-medium">Notifications</span>
          <button
            type="button"
            disabled={unread.size === 0}
            onClick={() => setUnread(new Set())}
            className="text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:underline disabled:opacity-50"
          >
            Mark all as read
          </button>
        </div>
        <div className="py-1">
          {examples.map((notice) => (
            <DropdownMenuItem
              key={notice.id}
              onClick={() =>
                setUnread((current) => {
                  const next = new Set(current)
                  next.delete(notice.id)
                  return next
                })
              }
              className="h-auto items-start gap-2.5 py-2.5"
            >
              <notice.icon className="mt-0.5" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={cn(unread.has(notice.id) && "font-medium")}>{notice.title}</span>
                <span className="text-xs text-muted-foreground">{notice.detail}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                {notice.time}
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-1.5",
                    unread.has(notice.id) ? "bg-primary" : "bg-transparent",
                  )}
                />
                {unread.has(notice.id) ? <span className="sr-only">Unread</span> : null}
              </span>
            </DropdownMenuItem>
          ))}
        </div>
        <DropdownMenuSeparator className="my-0" />
        <p className="px-3 py-2 text-xs text-muted-foreground">
          Example notifications. Real ones are coming soon.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
