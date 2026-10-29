import { expect, test } from "bun:test"
import { NextIntlClientProvider } from "next-intl"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { LocalDateTime } from "@/components/local-date-time"

test("uses a stable UTC fallback before the browser knows its timezone", () => {
  const value = Date.parse("2026-10-29T23:33:00Z")
  for (const locale of ["en", "de", "ja"] as const) {
    const html = renderToString(
      createElement(NextIntlClientProvider, {
        locale,
        timeZone: "UTC",
        messages: {},
        children: createElement(LocalDateTime, { value }),
      }),
    )
    expect(html).toContain('dateTime="2026-10-29T23:33:00.000Z"')
    expect(html).toContain(">2026-10-29 23:33 UTC</time>")
  }
})
