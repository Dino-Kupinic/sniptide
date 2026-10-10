// A copy of `request` with other headers (and, optionally, a body already read from it).
//
// Built from the request's url, method and headers rather than `new Request(request, …)`: in a
// production build Next hands route handlers a Proxy around the request, and the Request
// constructor can't read the original's private state through it ("Cannot read private member
// #state"), which failed every auth call. The same goes for reading `request.body` directly.
export function forwardRequest(request: Request, headers: Headers, body?: ArrayBuffer) {
  return new Request(request.url, { method: request.method, headers, body })
}
