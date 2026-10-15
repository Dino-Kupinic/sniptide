export function address(headers: Headers) {
  return headers.get("x-forwarded-for")
}
