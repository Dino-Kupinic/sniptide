import { sendLimitsDigest } from "./lib/digest"

const CHECK_MS = 15 * 60 * 1000

async function check() {
  try {
    const outcome = await sendLimitsDigest()
    if (outcome === "sent") console.info(JSON.stringify({ event: "limits_digest", outcome }))
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "limits_digest_failed",
        error: error instanceof Error ? error.message : "unknown",
      }),
    )
  }
}

export function scheduleDigest() {
  const timer = setInterval(() => void check(), CHECK_MS)
  timer.unref()
  void check()
}
