import { expect, test } from "bun:test"
import { buildReportDiagnostics, reportIssueUrl } from "@/lib/bug-report/draft"

test("reports capture diagnostics without query strings, fragments or URL credentials", () => {
  const body = buildReportDiagnostics({
    url: "https://user:pass@example.test/pastes/example?token=secret#password",
    browser: "Firefox 140",
    version: "abc123",
    userId: "ada",
    instance: "self-hosted",
  })
  expect(body).toContain("https://example.test/pastes/example")
  expect(body).not.toMatch(/secret|password|user:pass/)
  for (const value of ["Firefox 140", "abc123", "ada", "self-hosted"]) expect(body).toContain(value)
})

test("drafts preserve user text and cannot change the GitHub destination", () => {
  const body = "A bug & feedback\n日本語\nhttps://evil.test"
  const url = new URL(reportIssueUrl(body) ?? "")
  expect(url.origin + url.pathname).toBe("https://github.com/Dino-Kupinic/sniptide/issues/new")
  expect(url.searchParams.get("body")).toBe(body)
  expect(reportIssueUrl("   ")).toBeNull()
  expect(reportIssueUrl("あ".repeat(2000))).toBeNull()
})
