import { describe, expect, test } from "bun:test"
import { getConfig, parseSize } from "@/lib/config"

describe("parseSize", () => {
  test("reads human units, binary like the sizes the app shows", () => {
    expect(parseSize("1MB")).toBe(1024 * 1024)
    expect(parseSize("512KB")).toBe(512 * 1024)
    expect(parseSize("512 kb")).toBe(512 * 1024)
    expect(parseSize("1.5MB")).toBe(1.5 * 1024 * 1024)
    expect(parseSize("2MiB")).toBe(2 * 1024 * 1024)
    expect(parseSize("1g")).toBe(1024 ** 3)
  })

  test("reads a bare number as bytes", () => {
    expect(parseSize("2097152")).toBe(2097152)
    expect(parseSize("900B")).toBe(900)
  })

  test("refuses anything else", () => {
    for (const value of ["", "MB", "1 PB", "ten", "-1MB", "0", "0KB", "1MB!"]) {
      expect(parseSize(value)).toBeNull()
    }
  })
})

describe("getConfig", () => {
  test("has defaults for everything optional", () => {
    const config = getConfig({})
    expect(config.maxPasteBytes).toBe(1024 * 1024)
    expect(config.databaseUrl).toBeUndefined()
    expect(config.github).toBeUndefined()
    expect(config.githubToken).toBeUndefined()
  })

  test("treats an empty value as unset", () => {
    const config = getConfig({ MAX_PASTE_SIZE: "", SHARE_URL: "  ", GITHUB_TOKEN: "" })
    expect(config.maxPasteBytes).toBe(1024 * 1024)
    expect(config.shareUrl).toBeUndefined()
    expect(config.githubToken).toBeUndefined()
  })

  test("reads the paste limit with units", () => {
    expect(getConfig({ MAX_PASTE_SIZE: "2MB" }).maxPasteBytes).toBe(2 * 1024 * 1024)
    expect(getConfig({ MAX_PASTE_SIZE: "256 KB" }).maxPasteBytes).toBe(256 * 1024)
  })

  test("names the variable that is wrong", () => {
    expect(() => getConfig({ MAX_PASTE_SIZE: "lots" })).toThrow(/MAX_PASTE_SIZE must be a size/)
    expect(() => getConfig({ SHARE_URL: "sniptide.com" })).toThrow(/SHARE_URL must be a full URL/)
  })

  test("turns an OAuth provider on only when both halves are set", () => {
    expect(getConfig({ GITHUB_CLIENT_ID: "id" }).github).toBeUndefined()
    expect(getConfig({ GITHUB_CLIENT_ID: "id", GITHUB_CLIENT_SECRET: "secret" }).github).toEqual({
      clientId: "id",
      clientSecret: "secret",
    })
  })

  test("reads the live environment by default", () => {
    process.env.MAX_PASTE_SIZE = "3MB"
    try {
      expect(getConfig().maxPasteBytes).toBe(3 * 1024 * 1024)
    } finally {
      delete process.env.MAX_PASTE_SIZE
    }
  })
})
