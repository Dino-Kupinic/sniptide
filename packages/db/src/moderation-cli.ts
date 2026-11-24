import { hostname, userInfo } from "node:os"
import { inspectAbuseReport, listAbuseReports, resolveAbuseReport } from "./abuse"
import { createDb } from "./index"
import {
  inspectModeration,
  placeLegalHold,
  reinstateAccount,
  releaseLegalHold,
  suspendAccount,
  transitionModeration,
} from "./moderation"

const [operation, value, ...extra] = process.argv.slice(2)
if (
  extra.length ||
  !operation ||
  ![
    "inspect",
    "transition",
    "reports",
    "report",
    "resolve-report",
    "hold",
    "release-hold",
    "suspend",
    "reinstate",
  ].includes(operation) ||
  (operation !== "reports" && !value) ||
  (operation === "reports" && value)
) {
  throw new Error(
    "Usage: moderation inspect <paste UUID> | transition '<command JSON>' | reports | report <report UUID> | resolve-report '<resolution JSON>' | hold '<hold JSON>' | release-hold '<hold JSON>' | suspend '<suspension JSON>' | reinstate '<suspension JSON>'",
  )
}
const url = process.env.DATABASE_URL
if (!url) throw new Error("DATABASE_URL is required.")
const db = createDb(url)
try {
  const actor = `${userInfo().username}@${hostname()}`
  const commands = {
    hold: placeLegalHold,
    "release-hold": releaseLegalHold,
    suspend: suspendAccount,
    reinstate: reinstateAccount,
  } as const
  const command = commands[operation as keyof typeof commands]
  const result = command
    ? await command(db, JSON.parse(value ?? ""), actor)
    : operation === "reports"
      ? await listAbuseReports(db, actor)
      : operation === "report"
        ? await inspectAbuseReport(db, value, actor)
        : operation === "resolve-report"
          ? await resolveAbuseReport(db, JSON.parse(value ?? ""), actor)
          : operation === "inspect"
            ? await inspectModeration(db, value)
            : await transitionModeration(db, JSON.parse(value ?? ""), actor)
  process.stdout.write(`${JSON.stringify(result)}\n`)
} catch {
  process.stderr.write(
    "Moderation command failed. Check the command fields and current versions.\n",
  )
  process.exitCode = 1
} finally {
  await db.$client.end()
}
