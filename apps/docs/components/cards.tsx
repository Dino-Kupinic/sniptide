"use client"

import { cn } from "@sniptide/ui/lib/utils"
import Link from "fumadocs-core/link"
import { useI18n } from "fumadocs-ui/contexts/i18n"
import type { HTMLAttributes, ReactNode } from "react"
import { localePath } from "@/lib/i18n"

export function Cards({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn("not-prose my-6 grid gap-4 sm:grid-cols-2", className)} />
}

export type CardProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  href?: string
  external?: boolean
}

// A card in an index of pages: a plain icon, the page title in the heading face and one line about
// it, on a hairline panel. A linked card's border darkens on hover and the panel takes the fill.
export function Card({
  icon,
  title,
  description,
  href,
  external,
  className,
  children,
  ...props
}: CardProps) {
  const { locale } = useI18n()
  const body = (
    <>
      {icon && (
        <div aria-hidden className="mb-6 text-foreground [&_svg]:size-5 [&_svg]:stroke-[1.75]">
          {icon}
        </div>
      )}
      <h3 className="font-heading text-xl leading-7 font-bold tracking-[-0.02em] text-foreground">
        {title}
      </h3>
      {(description ?? children) && (
        <div className="mt-2 text-sm leading-6 text-muted-foreground">
          {description ?? children}
        </div>
      )}
    </>
  )
  const card = cn(
    "flex flex-col rounded-lg border bg-card p-6 md:p-7",
    href &&
      "transition-colors hover:border-foreground/25 hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    className,
  )

  if (!href) {
    return (
      <div {...props} className={card}>
        {body}
      </div>
    )
  }
  return (
    <Link {...props} href={localePath(locale ?? "en", href)} external={external} className={card}>
      {body}
    </Link>
  )
}
