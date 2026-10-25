import { hostname, userInfo } from "node:os"
import { createDb } from "./index"
import { inspectModeration, transitionModeration } from "./moderation"

const [operation, value, ...extra] = process.argv.slice(2)
if (extra.length || !value || (operation !== "inspect" && operation !== "transition")) {
  throw new Error("Usage: bun run moderation inspect <paste UUID> | transition '<command JSON>'")
}
const url = process.env.DATABASE_URL
if (!url) throw new Error("DATABASE_URL is required.")
const db = createDb(url)
try {
  const result =
    operation === "inspect"
      ? await inspectModeration(db, value)
      : await transitionModeration(db, JSON.parse(value), `${userInfo().username}@${hostname()}`)
  process.stdout.write(`${JSON.stringify(result)}\n`)
} catch {
  process.stderr.write(
    "Moderation command failed. Check the command fields and current versions.\n",
  )
  process.exitCode = 1
} finally {
  await db.$client.end()
}
