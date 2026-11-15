import { describe, expect, test } from "bun:test"
import { normalizeBaseUrl, ResponseTooLargeError, readJson } from "../src/http"

describe("normalizeBaseUrl", () => {
  test("keeps a path prefix and drops trailing slashes", () => {
    expect(normalizeBaseUrl("https://example.com/sniptide//")).toBe("https://example.com/sniptide")
    expect(normalizeBaseUrl("http://localhost:3000/")).toBe("http://localhost:3000")
  })

  test("rejects addresses a token must not be sent to", () => {
    class Failure extends Error {}
    for (const url of [
      "sniptide",
      "http://example.com",
      "ftp://localhost",
      "https://user:secret@example.com",
      "https://example.com?next=1",
      "https://example.com#top",
    ])
      expect(() => normalizeBaseUrl(url, Failure)).toThrow(Failure)
  })
})

describe("readJson", () => {
  test("parses a body that arrives in pieces, including a split character", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ title: "héllo" }))
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        // The cut falls inside the two-byte "é".
        controller.enqueue(bytes.slice(0, 12))
        controller.enqueue(bytes.slice(12))
        controller.close()
      },
    })
    expect(await readJson(new Response(body))).toEqual({ title: "héllo" })
  })

  test("stops reading past the limit", async () => {
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(1024).fill(0x20))
      },
      cancel() {
        cancelled = true
      },
    })
    await expect(readJson(new Response(body), 4096)).rejects.toThrow(ResponseTooLargeError)
    expect(cancelled).toBe(true)
  })

  test("rejects a missing body and invalid JSON", async () => {
    await expect(readJson(new Response(null))).rejects.toThrow()
    await expect(readJson(new Response("<html>"))).rejects.toThrow(SyntaxError)
    await expect(readJson(new Response("﻿{}"))).rejects.toThrow(SyntaxError)
  })
})
