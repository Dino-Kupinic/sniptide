import { ChevronLeftIcon } from "lucide-react"
import Link from "next/link"

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-1 text-sm text-link hover:underline"
    >
      <ChevronLeftIcon aria-hidden className="size-4" />
      {label}
    </Link>
  )
}
