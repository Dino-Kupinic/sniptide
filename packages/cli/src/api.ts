import type { Config } from "./config"
import { record } from "./contract"
import { CliError } from "./errors"

export class Api {
  constructor(private config: Config) {}

  async request(endpoint: string, body?: unknown): Promise<Record<string, unknown>> {
    if (!this.config.token || /[\r\n]/.test(this.config.token)) {
      throw new CliError(
        "Set SNIPTIDE_TOKEN or run sniptide login --token-stdin.",
        "AUTH_REQUIRED",
        3,
      )
    }
    let response: Response
    try {
      response = await fetch(`${this.config.baseUrl}/api/v1/${endpoint}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
      })
    } catch {
      throw new CliError(
        "Cannot reach Sniptide. Check the base URL and connection.",
        "NETWORK_ERROR",
        1,
      )
    }
    if (response.status === 401)
      throw new CliError("The API token is invalid or revoked.", "UNAUTHORIZED", 3)
    if (response.status === 403)
      throw new CliError("The API token lacks the required scope.", "FORBIDDEN", 3)
    if (response.status >= 300 && response.status < 400) {
      throw new CliError(
        "Sniptide redirected the request. Set the final instance URL explicitly.",
        "REDIRECT",
        1,
      )
    }
    if (response.status === 404) {
      throw new CliError(
        "Resource or CLI API not found. This instance needs the WRK-106 token API and the CLI endpoints described in API.md.",
        "NOT_FOUND",
        1,
      )
    }
    if (!response.ok) {
      const retry = response.headers.get("retry-after")
      const suffix =
        response.status === 429 && retry && /^\d+$/.test(retry)
          ? ` Retry after ${retry} seconds.`
          : ""
      // Do not echo an untrusted response body: it may contain credentials or request content.
      throw new CliError(`Sniptide returned HTTP ${response.status}.${suffix}`, "API_ERROR", 1)
    }
    try {
      if (!response.body) throw new Error("Missing response body")
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let bytes = 0
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          bytes += value.byteLength
          if (bytes > 25 * 1024 * 1024) {
            await reader.cancel()
            throw new CliError("API response exceeds 25 MiB.", "RESPONSE_TOO_LARGE", 1)
          }
          chunks.push(value)
        }
      } finally {
        reader.releaseLock()
      }
      return record(JSON.parse(Buffer.concat(chunks).toString("utf8")))
    } catch (error) {
      if (error instanceof CliError) throw error
      throw new CliError("Sniptide returned an invalid JSON response.", "INVALID_RESPONSE", 1)
    }
  }
}
