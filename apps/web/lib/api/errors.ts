const categories = {
  400: { code: "bad_request", resolution: "Check the request and try again." },
  401: { code: "unauthorized", resolution: "Provide a valid API token and try again." },
  403: { code: "forbidden", resolution: "Check the request origin and token permissions." },
  404: { code: "not_found", resolution: "Check the route or resource and try again." },
  409: { code: "conflict", resolution: "Check for an existing resource or an account limit." },
  413: {
    code: "payload_too_large",
    resolution: "Reduce the request or stored content and try again.",
  },
  422: { code: "unprocessable_entity", resolution: "Check the request and account limits." },
  429: {
    code: "too_many_requests",
    resolution: "Wait for the Retry-After interval before trying again.",
  },
  503: {
    code: "service_unavailable",
    resolution: "Wait for the Retry-After interval before trying again.",
  },
  500: {
    code: "internal_error",
    resolution:
      "Check whether the operation completed before retrying. Contact the instance operator if the error persists.",
  },
} as const satisfies Record<number, { code: string; resolution: string }>

export function errorBody(status: number, message: string) {
  const category = categories[status as keyof typeof categories] ?? categories[500]
  return {
    ok: false as const,
    error: message,
    code: category.code,
    message,
    resolution: category.resolution,
  }
}

export function failure(status: number, message: string, retryAfterSeconds?: number) {
  return Response.json(errorBody(status, message), {
    status,
    headers: {
      "cache-control": "private, no-store",
      ...(retryAfterSeconds ? { "retry-after": String(retryAfterSeconds) } : {}),
    },
  })
}
