// Runs once when the server starts. In production it checks every 15 minutes whether the weekly
// limits digest is due (lib/digest.tsx). The work lives in instrumentation-node.ts so the Edge
// build of this file never sees Node modules.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production") {
    const { scheduleDigest } = await import("./instrumentation-node")
    scheduleDigest()
  }
}
