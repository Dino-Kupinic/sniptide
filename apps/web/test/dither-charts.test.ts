import { describe, expect, test } from "bun:test"
import { NextIntlClientProvider } from "next-intl"
import { createElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ViewsChart } from "@/components/analytics-page/views-chart"
import { ViewsBarChart } from "@/components/dashboard/views-chart"
import { ViewsSparkline } from "@/components/paste/views-chart"
import { UsageMeters } from "@/components/settings/usage-meters"
import { loadMessages } from "@/lib/i18n/messages"

async function render(children: ReactNode) {
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale: "en",
      timeZone: "UTC",
      messages: await loadMessages("en"),
      children,
    }),
  )
}

describe("dithered charts", () => {
  test("small usage meters preserve limits and accessible counts", async () => {
    const html = await render(
      createElement(UsageMeters, {
        metrics: [
          { label: "Storage", used: 80, limit: 100, format: String },
          { label: "Files", used: 5, limit: null, format: String },
        ],
      }),
    )
    expect(html.match(/role="progressbar"/g)).toHaveLength(1)
    expect(html).toContain('aria-valuenow="80"')
    expect(html).toContain('aria-valuetext="80 of 100"')
    expect(html).toContain("mask-image:")
    expect(html).toContain("mask-size:calc(1px * 4)")
    expect(html).not.toContain("filter:")
    expect(html).toContain("height:calc(1px * 2)")
    expect(html).not.toContain("drop-shadow")
  })

  test("analytics retains exact values, accessible data, and one keyboard entry point", async () => {
    const html = await render(
      createElement(ViewsChart, {
        title: "Views",
        rangeLabel: "Last 7 days",
        metric: "views",
        points: [0, 12, 3].map((views, index) => ({
          date: `2026-11-0${index + 1}`,
          label: `Nov ${index + 1}`,
          values: { views, unique: 0, copies: 0, raw: 0 },
        })),
      }),
    )
    expect(html).toContain("mask-image:")
    expect(html).toContain("mask-size:4px")
    expect(html).not.toContain("filter:")
    expect(html).toContain("var(--highlight)")
    expect(html).toContain("<td>0</td>")
    expect(html).toContain("<td>12</td>")
    expect(html.match(/tabindex="0"/g)).toHaveLength(1)
    expect(html.match(/<button/g)).toHaveLength(3)
    expect(html).not.toContain("<canvas")
  })

  test("dashboard and usage retain labels and highlight the peak over a dither fill", async () => {
    const html = await render(
      createElement(ViewsBarChart, { values: [0, 12, 3], labels: ["Mon", "Tue", "Wed"] }),
    )
    expect(html).toContain("mask-image:")
    expect(html).toContain("mask-size:4px")
    expect(html).not.toContain("filter:")
    expect(html).toContain("var(--chart-1)")
    expect(html).toContain("var(--highlight)")
    expect(html).toContain('role="group"')
    expect(html.match(/tabindex="0"/g)).toHaveLength(1)
    expect(html.match(/<button/g)).toHaveLength(3)
    expect(html).toContain("Tue 12")
  })

  test("empty charts have no highlighted peak and sparklines stay decorative", async () => {
    const empty = await render(
      createElement(ViewsBarChart, { values: [0, 0], labels: ["Mon", "Tue"] }),
    )
    expect(empty).not.toContain("var(--highlight)")
    const sparkline = await render(createElement(ViewsSparkline, { values: [0, 2, 1] }))
    expect(sparkline).toContain('aria-hidden="true"')
    expect(sparkline).toContain("mask-image:")
    expect(sparkline).toContain("var(--highlight)")
  })
})
