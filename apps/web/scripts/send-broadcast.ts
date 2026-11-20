// bun run broadcast <file> [--test <email> | --send [--at <when>]]. See lib/broadcasts/send.ts.
import { runBroadcast } from "@/lib/broadcasts/send"

try {
  await runBroadcast(process.argv.slice(2), process.env)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
