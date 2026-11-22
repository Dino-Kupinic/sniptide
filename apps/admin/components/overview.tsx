import Link from "next/link"
import { PageHeader } from "@/components/page-header"
import { relativeTime } from "@/lib/format"

const number = new Intl.NumberFormat("en-US")

// One figure per row, label on the left and the number aligned right, so the numbers line up.
function Figure({ label, value, href }: { label: string; value: number; href?: string }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 px-4 py-3">
      <dt className="text-sm text-muted-foreground">
        {href ? (
          <Link href={href} className="text-link hover:underline">
            {label}
          </Link>
        ) : (
          label
        )}
      </dt>
      <dd className="text-sm font-medium tabular-nums">{number.format(value)}</dd>
    </div>
  )
}

export function Overview({
  accounts,
  week,
  month,
  pastes,
  subscribers,
  sent,
  recent,
  now,
}: {
  accounts: number
  week: number
  month: number
  pastes: number
  subscribers: number
  sent: number
  recent: { id: string; name: string; email: string; createdAt: string }[]
  now: string
}) {
  return (
    <div className="flex flex-col gap-6 p-4 lg:gap-8 lg:p-7">
      <PageHeader
        title="Overview"
        description={`${number.format(week)} ${week === 1 ? "account" : "accounts"} joined in the last 7 days.`}
      />
      <div className="grid min-w-0 gap-6 lg:grid-cols-2 lg:gap-8">
        <section aria-labelledby="figures" className="flex min-w-0 flex-col gap-3">
          <h2 id="figures" className="text-sm font-medium">
            Accounts and pastes
          </h2>
          <dl className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            <Figure label="Accounts" value={accounts} />
            <Figure label="New in the last 7 days" value={week} />
            <Figure label="New in the last 30 days" value={month} />
            <Figure label="Pastes" value={pastes} />
            <Figure label="Email subscribers" value={subscribers} />
            <Figure label="Emails sent" value={sent} href="/emails" />
          </dl>
        </section>
        <section aria-labelledby="recent" className="flex min-w-0 flex-col gap-3">
          <h2 id="recent" className="text-sm font-medium">
            Newest accounts
          </h2>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No one has signed up yet.</p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {recent.map((person) => (
                <li key={person.id} className="flex min-h-12 items-center gap-4 px-4 py-3">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{person.name}</span>
                    <span className="truncate text-[13px] text-muted-foreground">
                      {person.email}
                    </span>
                  </span>
                  <span className="shrink-0 text-[13px] text-muted-foreground">
                    {relativeTime(new Date(person.createdAt), new Date(now))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
