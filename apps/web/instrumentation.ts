// Runs once when the server starts. The work lives in instrumentation-node.ts so the Edge
// build of this file never sees Node modules.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { migrateOnStartup, setUpClientIp, startBackgroundJobs } = await import(
      "./instrumentation-node"
    )
    await setUpClientIp()
    await migrateOnStartup()
    await startBackgroundJobs()
  }
}
