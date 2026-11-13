import type { Replies, Reply, Request } from "../lib/protocol"

export class RequestError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message)
  }
}

// Asks the background worker and resolves with its answer, or throws its error message.
export async function ask<R extends Request>(request: R): Promise<Replies[R["type"]]> {
  const reply: Reply<Replies[R["type"]]> = await chrome.runtime.sendMessage(request)
  if (!reply.ok) throw new RequestError(reply.error, reply.code)
  return reply.value
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof RequestError ? error.message : fallback
}
