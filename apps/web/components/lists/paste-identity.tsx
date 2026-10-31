import Link from "next/link"

// Shared by real rows and their measured loading preview. No menus, effects or requests.
export function PasteIdentity({
  title,
  slug,
  host,
  owner,
  href,
}: {
  title: string
  slug: string
  host: string
  owner?: string
  href?: string
}) {
  const titleClass = "block truncate text-sm font-medium"
  return (
    <>
      {href ? (
        <Link
          href={href}
          title={title}
          className={`${titleClass} outline-none after:absolute after:inset-0 focus-visible:underline`}
        >
          {title}
        </Link>
      ) : (
        <span className={titleClass}>{title}</span>
      )}
      <span className="block truncate font-mono text-xs text-muted-foreground">
        {owner ? `@${owner} · ` : ""}
        {host}/{slug}
      </span>
    </>
  )
}
