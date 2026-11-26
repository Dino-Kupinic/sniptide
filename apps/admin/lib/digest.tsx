import "server-only"

import { render } from "@react-email/render"
import { EmailFrame, Padded, small, text } from "@workspace/email/frame"
import { fonts, light } from "@workspace/email/theme"
import { Heading, Text } from "react-email"
import { type AccountRow, highestShare, listAccountUsage, NEAR_LIMIT, nearLimit } from "./accounts"
import { getConfig } from "./config"
import { formatBytes, percent } from "./format"
import { resendClient } from "./store"

// The weekly email to the operator that lists every account above 80% of any limit. It goes out on
// Mondays from 08:00 UTC, and the ISO week is its idempotency key, so a restart or a second check
// in the same hour sends it once.

const number = new Intl.NumberFormat("en-US")

// Monday is day 1. The digest is due during the first hour of Monday's working day in UTC.
export function digestDue(now: Date) {
  return now.getUTCDay() === 1 && now.getUTCHours() === 8
}

// The ISO 8601 week of a date, such as "2026-W48".
export function isoWeek(date: Date) {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const weekday = day.getUTCDay() || 7
  day.setUTCDate(day.getUTCDate() + 4 - weekday)
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7)
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, "0")}`
}

function usageLine(row: AccountRow) {
  const parts = [
    `storage ${formatBytes(row.storageBytes)}${row.shares.storage === null ? "" : ` (${percent(row.shares.storage)})`}`,
    `${number.format(row.pasteCount)} pastes${row.shares.pastes === null ? "" : ` (${percent(row.shares.pastes)})`}`,
    `busiest API day ${number.format(row.apiPeakDay)} requests (${percent(row.shares.api)})`,
  ]
  return parts.join(", ")
}

function DigestEmail({ rows, week }: { rows: AccountRow[]; week: string }) {
  const subject = `${rows.length} ${rows.length === 1 ? "account is" : "accounts are"} close to a limit`
  return (
    <EmailFrame locale="en" subject={subject} preview={`Week ${week}`}>
      <Padded padding="32px 24px 24px">
        <Heading
          as="h1"
          style={{
            margin: "0 0 8px",
            fontFamily: fonts.heading,
            fontSize: "20px",
            lineHeight: "28px",
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: light.foreground,
          }}
        >
          {subject}
        </Heading>
        <Text style={{ ...text, margin: "0 0 16px", color: light.muted }}>
          Accounts at {percent(NEAR_LIMIT)} or more of storage, pastes or one token's daily API
          ceiling, week {week}.
        </Text>
        {rows.map((row) => (
          <Text key={row.id} style={{ ...text, margin: "0 0 12px" }}>
            <strong>{row.name}</strong> ({row.email}): {usageLine(row)}.
          </Text>
        ))}
        <Text style={small}>
          The Accounts page in the admin app sorts every account by each limit.
        </Text>
      </Padded>
    </EmailFrame>
  )
}

// Sends the digest when one is due and at least one account is close to a limit. Returns what it
// did, for the log.
export async function sendLimitsDigest(now = new Date(), options: { force?: boolean } = {}) {
  if (!options.force && !digestDue(now)) return "not_due" as const
  const rows = nearLimit(await listAccountUsage(now)).sort(
    (a, b) => highestShare(b.shares) - highestShare(a.shares),
  )
  if (!rows.length) return "nothing_to_report" as const
  const config = getConfig()
  const week = isoWeek(now)
  const element = <DigestEmail rows={rows} week={week} />
  await resendClient().sendEmail({
    from: config.from,
    to: config.digestTo,
    subject: `[Sniptide admin] ${rows.length} ${rows.length === 1 ? "account is" : "accounts are"} close to a limit`,
    html: await render(element),
    text: await render(element, { plainText: true }),
    idempotencyKey: `limits-digest-${week}`,
  })
  return "sent" as const
}
