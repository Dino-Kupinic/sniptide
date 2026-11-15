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

export const onRequestError: import("next").Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  console.error(
    JSON.stringify({ event: "request_error", route: context.routePath, type: context.routeType }),
  )
  // Error tracking needs Node; errors in the Edge runtime stay in the log.
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  const header = (name: string) => {
    const value = request.headers[name]
    return Array.isArray(value) ? value[0] : value
  }
  const { captureServerError } = await import("@/lib/error-tracking")
  await captureServerError(error, {
    source: "request",
    route: context.routePath,
    routeType: context.routeType,
    method: request.method,
    host: (header("x-forwarded-host") ?? header("host"))
      ?.split(",")[0]
      ?.trim()
      .replace(/:\d+$/, ""),
  })
}
