import { expect, test } from "bun:test"
import { NextRequest } from "next/server"
import { proxy } from "@/proxy"

test("rejects multipart page posts without a Next-Action header", () => {
  const request = new NextRequest("https://app.sniptide.com/missing/page", {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=declared" },
    body: "a body without the declared delimiter",
  })

  expect(proxy(request).status).toBe(400)
  expect(request.bodyUsed).toBe(false)
})

test("passes through multipart Server Actions and API requests", () => {
  const form = new FormData()
  form.set("value", "example")

  const action = new NextRequest("https://app.sniptide.com/new", {
    method: "POST",
    headers: { "next-action": "test-action" },
    body: form,
  })
  const api = new NextRequest("https://app.sniptide.com/api/auth/example", {
    method: "POST",
    body: form,
  })

  expect(proxy(action).headers.get("x-middleware-next")).toBe("1")
  expect(action.bodyUsed).toBe(false)
  expect(proxy(api).headers.get("x-middleware-next")).toBe("1")
})
