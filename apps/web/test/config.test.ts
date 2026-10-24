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
  test("points the account menu's resource links at the project by default", () => {
    expect(getConfig({}).resourceLinks).toEqual({
      homepage: "https://sniptide.com",
      documentation: "https://docs.sniptide.com",
      help: "https://github.com/Dino-Kupinic/sniptide/issues",
    })
  })

  test("lets a self-hosted instance point the resource links elsewhere", () => {
    expect(
      getConfig({
        HOMEPAGE_URL: "https://paste.example.com",
        DOCS_URL: "https://wiki.example.com/paste",
        HELP_URL: "",
      }).resourceLinks,
    ).toEqual({
      homepage: "https://paste.example.com",
      documentation: "https://wiki.example.com/paste",
      help: "https://github.com/Dino-Kupinic/sniptide/issues",
    })
  })

  test("names the variable when a resource link is not a URL", () => {
    expect(() => getConfig({ DOCS_URL: "docs.example.com" })).toThrow(/DOCS_URL/)
  })

  test("has defaults for everything optional", () => {
    const config = getConfig({})
    expect(config.maxPasteBytes).toBe(1024 * 1024)
    expect(config.databaseUrl).toBeUndefined()
    expect(config.github).toBeUndefined()
    expect(config.githubToken).toBeUndefined()
  })

  test("leaves self-hosted extras off and sign-up open by default", () => {
    const config = getConfig({})
    expect(config.analytics).toBeUndefined()
    expect(config.github).toBeUndefined()
    expect(config.google).toBeUndefined()
    expect(config.allowedEmails).toBeUndefined()
    expect(config.allowSignUp).toBe(true)
  })

  test("reads the sign-up toggle", () => {
    for (const value of ["false", "FALSE", "0", "no", "off"]) {
      expect(getConfig({ ALLOW_SIGN_UP: value }).allowSignUp).toBe(false)
    }
    for (const value of ["true", "1", "yes", "on", ""]) {
      expect(getConfig({ ALLOW_SIGN_UP: value }).allowSignUp).toBe(true)
    }
    expect(() => getConfig({ ALLOW_SIGN_UP: "maybe" })).toThrow(/ALLOW_SIGN_UP must be "true"/)
  })

  test("boots with only the database and auth secret", () => {
    const config = getConfig({
      DATABASE_URL: "postgres://u:p@db/sniptide",
      BETTER_AUTH_SECRET: "s",
    })
    expect(config.databaseUrl).toBe("postgres://u:p@db/sniptide")
    expect(config.authSecret).toBe("s")
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
    expect(() => getConfig({ HOME_URL: "example" })).toThrow(/HOME_URL must be a full URL/)
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

describe("optional SMTP configuration", () => {
  const complete = {
    SMTP_HOST: "localhost",
    SMTP_PORT: "2525",
    SMTP_FROM: "sniptide@example.com",
    BETTER_AUTH_URL: "https://sniptide.example.com",
    BETTER_AUTH_SECRET: "a-secret-at-least-thirty-two-characters-long",
  }
  test("omitted SMTP stays disabled and configured SMTP requires TLS by default", () => {
    expect(getConfig({}).smtp).toBeUndefined()
    expect(getConfig(complete).smtp).toEqual({
      host: "localhost",
      port: 2525,
      from: "sniptide@example.com",
      secure: false,
      requireTLS: true,
      auth: undefined,
    })
    expect(
      getConfig({
        ...complete,
        SMTP_SECURE: "true",
        SMTP_REQUIRE_TLS: "false",
        SMTP_USER: "user",
        SMTP_PASSWORD: "password",
      }).smtp,
    ).toMatchObject({ secure: true, requireTLS: false, auth: { user: "user", pass: "password" } })
  })
  test("incomplete SMTP, unpaired credentials and short signing secret are rejected", () => {
    for (const key of [
      "SMTP_HOST",
      "SMTP_PORT",
      "SMTP_FROM",
      "BETTER_AUTH_URL",
      "BETTER_AUTH_SECRET",
    ])
      expect(() => getConfig({ ...complete, [key]: "" })).toThrow(/SMTP requires/)
    expect(() => getConfig({ ...complete, SMTP_USER: "user" })).toThrow(/paired SMTP_USER/)
    expect(() => getConfig({ ...complete, SMTP_PASSWORD: "password" })).toThrow(/paired SMTP_USER/)
    expect(() => getConfig({ ...complete, BETTER_AUTH_SECRET: "short" })).toThrow(/at least 32/)
  })
  test("invalid SMTP values name their environment variable", () => {
    expect(() => getConfig({ ...complete, SMTP_PORT: "0" })).toThrow(/SMTP_PORT/)
    expect(() => getConfig({ ...complete, SMTP_FROM: "bad" })).toThrow(/SMTP_FROM/)
    expect(() => getConfig({ ...complete, SMTP_REQUIRE_TLS: "maybe" })).toThrow(/SMTP_REQUIRE_TLS/)
  })
})
