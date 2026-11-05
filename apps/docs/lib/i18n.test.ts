import { describe, expect, test } from "bun:test"
import { localePath, stripLocale } from "./i18n"

describe("locale paths", () => {
  test("keeps English paths bare and prefixes the others", () => {
    expect(localePath("en", "/mcp")).toBe("/mcp")
    expect(localePath("de", "/mcp")).toBe("/de/mcp")
    expect(localePath("ja", "/")).toBe("/ja")
  })

  test("leaves prefixed, relative and external links alone", () => {
    expect(localePath("de", "/es/mcp")).toBe("/es/mcp")
    expect(localePath("de", "./cli.mdx")).toBe("./cli.mdx")
    expect(localePath("de", "https://sniptide.com")).toBe("https://sniptide.com")
    expect(localePath("de", "#setup")).toBe("#setup")
  })

  test("strips the language segment", () => {
    expect(stripLocale("/de/self-hosting/backups")).toBe("/self-hosting/backups")
    expect(stripLocale("/zh")).toBe("/")
    expect(stripLocale("/mcp")).toBe("/mcp")
  })
})
