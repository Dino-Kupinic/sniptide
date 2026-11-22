import { HomeIcon, type LucideIcon, MailIcon } from "lucide-react"

// The admin app's sections, in sidebar order. A new section is a route under app/(admin) and an
// entry here.
export const SECTIONS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Overview", icon: HomeIcon },
  { href: "/emails", label: "Emails", icon: MailIcon },
]

// The section a path belongs to: the longest matching prefix, so /emails/abc is Emails.
export function activeSection(pathname: string) {
  return SECTIONS.filter(({ href }) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`),
  ).at(-1)?.href
}
