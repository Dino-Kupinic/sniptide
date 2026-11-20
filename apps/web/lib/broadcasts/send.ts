import path from "node:path"
import { pathToFileURL } from "node:url"
import { render } from "@react-email/render"
import { createElement, type FunctionComponent } from "react"
import type { BroadcastProps } from "@/lib/email/broadcast"
import { createResendClient, type ResendClient } from "./resend"

// The work behind `bun run broadcast`: render one file from emails/broadcasts and hand it to
// Resend as a test email, a draft broadcast or a broadcast that goes out.

export interface BroadcastModule {
  default: FunctionComponent<BroadcastProps>
  subject: string
  preview: string
}

export type BroadcastMode =
  | { kind: "test"; to: string }
  | { kind: "draft" }
  | { kind: "send"; at?: string }

const usage = `Usage: bun run broadcast <file> [--test <email> | --send [--at <when>]]

  <file>          A broadcast in emails/broadcasts, such as emails/broadcasts/2026-11-update.tsx.
  --test <email>  Send it once to that address. Nothing reaches the segment.
  (no flag)       Create it in Resend as a draft to review and send from the dashboard.
  --send          Create it and send it to every subscriber in the segment.
  --at <when>     With --send, schedule it: "tomorrow at 9am CET" or an ISO 8601 time.

Reads RESEND_API_KEY, RESEND_SEGMENT_ID and BROADCAST_FROM, plus BETTER_AUTH_URL for the logo,
fonts and links, and OPERATOR_NAME and OPERATOR_ADDRESS for the sender line.`

export function parseArgs(argv: string[]): { file: string; mode: BroadcastMode } {
  const [file, ...rest] = argv
  if (!file || file.startsWith("--")) throw new Error(usage)
  let mode: BroadcastMode = { kind: "draft" }
  for (let index = 0; index < rest.length; index++) {
    const flag = rest[index]
    if (flag === "--test") {
      const to = rest[++index]
      if (!to?.includes("@")) throw new Error("--test needs an email address.")
      mode = { kind: "test", to }
    } else if (flag === "--send")
      mode = { kind: "send", at: mode.kind === "send" ? mode.at : undefined }
    else if (flag === "--at") {
      const at = rest[++index]
      if (!at) throw new Error('--at needs a time, such as "tomorrow at 9am CET".')
      if (mode.kind !== "send") throw new Error("--at only works with --send.")
      mode = { kind: "send", at }
    } else throw new Error(`Unknown option ${flag}.\n\n${usage}`)
  }
  return { file, mode }
}

export async function renderBroadcast(module: BroadcastModule, props: BroadcastProps) {
  const element = createElement(module.default, props)
  return {
    subject: module.subject,
    html: await render(element),
    // Headings keep their case in the plain-text part instead of html-to-text's capitals.
    text: await render(element, {
      plainText: true,
      htmlToTextOptions: {
        selectors: ["h1", "h2"].map((selector) => ({ selector, options: { uppercase: false } })),
      },
    }),
  }
}

export async function runBroadcast(
  argv: string[],
  env: Record<string, string | undefined>,
  {
    load = (file: string) =>
      import(pathToFileURL(path.resolve(file)).href) as Promise<BroadcastModule>,
    client = (config: { apiKey: string; segmentId: string }) => createResendClient(config),
    log = console.log,
  }: {
    load?: (file: string) => Promise<BroadcastModule>
    client?: (config: { apiKey: string; segmentId: string }) => ResendClient
    log?: (line: string) => void
  } = {},
) {
  const { file, mode } = parseArgs(argv)
  const apiKey = env.RESEND_API_KEY
  const segmentId = env.RESEND_SEGMENT_ID
  const from = env.BROADCAST_FROM
  if (!apiKey || !segmentId || !from)
    throw new Error("Set RESEND_API_KEY, RESEND_SEGMENT_ID and BROADCAST_FROM.")
  // Marketing email has to name its sender with a postal address, so only a test goes without.
  if (mode.kind !== "test" && !env.OPERATOR_NAME)
    throw new Error("Set OPERATOR_NAME and OPERATOR_ADDRESS so the email names its sender.")
  const module = await load(file)
  if (typeof module.default !== "function" || !module.subject || !module.preview)
    throw new Error(`${file} needs a default component and exports named subject and preview.`)
  const email = await renderBroadcast(module, {
    appUrl: env.BETTER_AUTH_URL,
    operator: env.OPERATOR_NAME
      ? { name: env.OPERATOR_NAME, address: env.OPERATOR_ADDRESS }
      : undefined,
  })
  const resend = client({ apiKey, segmentId })
  if (mode.kind === "test") {
    await resend.sendEmail({ from, to: mode.to, ...email, subject: `[Test] ${email.subject}` })
    log(`Sent a test of "${email.subject}" to ${mode.to}.`)
    return
  }
  const id = await resend.createBroadcast({ name: path.basename(file), from, ...email })
  if (mode.kind === "draft") {
    log(`Created draft broadcast ${id}. Review and send it at https://resend.com/broadcasts/${id}.`)
    return
  }
  await resend.sendBroadcast(id, mode.at)
  log(mode.at ? `Scheduled broadcast ${id} for ${mode.at}.` : `Sent broadcast ${id}.`)
}
