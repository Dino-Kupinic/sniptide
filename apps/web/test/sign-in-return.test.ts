import { expect, test } from "bun:test"
import { NextRequest } from "next/server"
import { afterSignIn, RETURN_TO_HEADER, signInPath } from "@/lib/auth-redirect"
import { proxy } from "@/proxy"

test("sign-in returns to the editor opened from a template", () => {
  expect(afterSignIn("/new?template=claude-md")).toBe("/new?template=claude-md")
  expect(afterSignIn("/new")).toBe("/new")
  for (const next of ["/new?template=../x", "/new?template=a&gist=1", "/newx", "/new#x"])
    expect(afterSignIn(next)).toBe("/dashboard")
})

test("a page behind sign-in passes an accepted path to the sign-in page", () => {
  expect(signInPath("/new?template=claude-md")).toBe("/sign-in?next=%2Fnew%3Ftemplate%3Dclaude-md")
  expect(signInPath("/settings")).toBe("/sign-in")
  expect(signInPath(null)).toBe("/sign-in")
})

test("the proxy tells the page which address was opened, over any value the client sent", () => {
  const response = proxy(
    new NextRequest("https://app.sniptide.com/new?template=claude-md", {
      headers: { [RETURN_TO_HEADER]: "/oauth/authorize?client_id=evil" },
    }),
  )
  expect(response.headers.get(`x-middleware-request-${RETURN_TO_HEADER}`)).toBe(
    "/new?template=claude-md",
  )
})
