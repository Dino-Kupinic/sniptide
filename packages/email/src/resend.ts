// A small client for the parts of the Resend API that product update emails use: contacts in one
// segment, broadcasts to that segment, and single test emails. The app uses the contact calls to
// keep subscribers in step, and the admin app uses the broadcast calls to send. Plain fetch keeps
// the SDK out of self-hosted builds, which never call it.

const API = "https://api.resend.com"

export class ResendError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = "ResendError"
  }
}

export interface ResendClient {
  // Subscribes an address to broadcasts and puts it in the segment, creating the contact when
  // Resend doesn't know it yet.
  subscribe(email: string): Promise<void>
  // Marks the contact unsubscribed from every broadcast. Unknown addresses are left alone.
  unsubscribe(email: string): Promise<void>
  // Deletes the contact, for a deleted account or an address that is no longer the account's.
  remove(email: string): Promise<void>
  createBroadcast(input: {
    name: string
    from: string
    subject: string
    html: string
    text: string
  }): Promise<string>
  sendBroadcast(id: string, scheduledAt?: string): Promise<void>
  sendEmail(input: {
    from: string
    to: string
    subject: string
    html: string
    text: string
  }): Promise<void>
}

export function createResendClient(
  { apiKey, segmentId }: { apiKey: string; segmentId: string },
  fetcher: typeof fetch = fetch,
): ResendClient {
  async function call(method: string, path: string, body?: unknown) {
    const response = await fetcher(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => "")
      throw new ResendError(
        response.status,
        `Resend ${method} ${path.split("/")[1]} failed with ${response.status}: ${detail.slice(0, 200)}`,
      )
    }
    return (await response.json().catch(() => ({}))) as Record<string, unknown>
  }
  const contact = (email: string) => `/contacts/${encodeURIComponent(email)}`
  const ignoreMissing = (error: unknown) => {
    if (!(error instanceof ResendError && error.status === 404)) throw error
  }

  return {
    async subscribe(email) {
      try {
        await call("PATCH", contact(email), { unsubscribed: false })
      } catch (error) {
        ignoreMissing(error)
        await call("POST", "/contacts", {
          email,
          unsubscribed: false,
          segments: [{ id: segmentId }],
        })
        return
      }
      await call("POST", `${contact(email)}/segments/${encodeURIComponent(segmentId)}`)
    },
    async unsubscribe(email) {
      await call("PATCH", contact(email), { unsubscribed: true }).catch(ignoreMissing)
    },
    async remove(email) {
      await call("DELETE", contact(email)).catch(ignoreMissing)
    },
    async createBroadcast(input) {
      const created = await call("POST", "/broadcasts", { ...input, segment_id: segmentId })
      if (typeof created.id !== "string") throw new Error("Resend returned no broadcast id")
      return created.id
    },
    async sendBroadcast(id, scheduledAt) {
      await call(
        "POST",
        `/broadcasts/${encodeURIComponent(id)}/send`,
        scheduledAt ? { scheduled_at: scheduledAt } : undefined,
      )
    },
    async sendEmail(input) {
      await call("POST", "/emails", input)
    },
  }
}
