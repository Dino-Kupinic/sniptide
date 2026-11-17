import { describe, expect, test } from "bun:test"
import { getConfig, parseSize } from "@/lib/config"
import { hasFeature, isCloud } from "@/lib/edition"

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

describe("edition", () => {
  test("defaults to self-host and validates the edition", () => {
    expect(getConfig({}).edition).toBe("selfhost")
    expect(getConfig({ SNIPTIDE_EDITION: "" }).edition).toBe("selfhost")
    expect(() => getConfig({ SNIPTIDE_EDITION: "hosted" })).toThrow(/SNIPTIDE_EDITION/)
  })

  test("identifies cloud features for each edition", () => {
    for (const edition of ["selfhost", "cloud"] as const) {
      const config = getConfig({ SNIPTIDE_EDITION: edition })
      expect(isCloud(config)).toBe(edition === "cloud")
      for (const feature of ["discovery", "gallery", "shortLinks"] as const) {
        expect(hasFeature(feature, config)).toBe(edition === "cloud")
      }
    }
  })

  test("reserves the Sniptide share domain for Cloud and accepts independent share domains", () => {
    expect(getConfig({ SHARE_URL: "https://sniptide.com" }).shareUrl).toBeUndefined()
    expect(getConfig({ SHARE_URL: "https://WWW.SNIPTIDE.COM./" }).shareUrl).toBeUndefined()
    expect(getConfig({ SHARE_URL: "https://share.example" }).shareUrl).toBe("https://share.example")
    expect(
      getConfig({
        SHARE_URL: "https://sniptide.com",
        SNIPTIDE_EDITION: "cloud",
      }).shareUrl,
    ).toBe("https://sniptide.com")
  })
})

describe("getConfig", () => {
  test("keeps abuse intake off unless its required server settings are valid", () => {
    expect(getConfig({}).abuseReportsEnabled).toBe(false)
    expect(() => getConfig({ ABUSE_REPORTS_ENABLED: "true" })).toThrow("ABUSE_REPORTS_ENABLED")
    expect(
      getConfig({
        ABUSE_REPORTS_ENABLED: "true",
        BETTER_AUTH_URL: "https://app.example",
        BETTER_AUTH_SECRET: "a".repeat(32),
      }).abuseReportsEnabled,
    ).toBe(true)
  })
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
    expect(getConfig({ ALLOW_SIGN_UP: " First " }).allowSignUp).toBe("first")
    expect(() => getConfig({ ALLOW_SIGN_UP: "maybe" })).toThrow(
      /ALLOW_SIGN_UP must be "true", "false" or "first"/,
    )
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
  test("port and implicit TLS default from each other", () => {
    const { SMTP_PORT: _, ...noPort } = complete
    expect(getConfig(noPort).smtp).toMatchObject({ port: 587, secure: false })
    expect(getConfig({ ...noPort, SMTP_SECURE: "true" }).smtp).toMatchObject({
      port: 465,
      secure: true,
    })
    expect(getConfig({ ...complete, SMTP_PORT: "465" }).smtp).toMatchObject({
      port: 465,
      secure: true,
    })
    expect(getConfig({ ...complete, SMTP_PORT: "465", SMTP_SECURE: "false" }).smtp).toMatchObject({
      port: 465,
      secure: false,
    })
  })
  test("incomplete SMTP, unpaired credentials and short signing secret are rejected", () => {
    for (const key of ["SMTP_HOST", "SMTP_FROM", "BETTER_AUTH_URL", "BETTER_AUTH_SECRET"])
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

describe("legal settings", () => {
  test("are all off by default", () => {
    expect(getConfig({}).legal).toEqual({
      termsUrl: undefined,
      privacyUrl: undefined,
      operator: undefined,
      copyrightEmail: undefined,
    })
  })
  test("read the operator, documents and copyright contact", () => {
    expect(
      getConfig({
        TERMS_URL: "https://example.com/terms",
        PRIVACY_URL: "https://example.com/privacy",
        OPERATOR_NAME: "Example GmbH",
        OPERATOR_ADDRESS: "Ring 1\n1010 Wien",
        COPYRIGHT_EMAIL: "copyright@example.com",
      }).legal,
    ).toEqual({
      termsUrl: "https://example.com/terms",
      privacyUrl: "https://example.com/privacy",
      operator: { name: "Example GmbH", address: "Ring 1\n1010 Wien" },
      copyrightEmail: "copyright@example.com",
    })
  })
  test("reject a malformed address or link", () => {
    expect(() => getConfig({ COPYRIGHT_EMAIL: "nope" })).toThrow(/COPYRIGHT_EMAIL/)
    expect(() => getConfig({ TERMS_URL: "terms" })).toThrow(/TERMS_URL/)
  })
})

describe("getConfig", () => {
  const env = process.env as Record<string, string | undefined>
  const mode = env.NODE_ENV
  const shareUrl = env.SHARE_URL
  function restore() {
    env.NODE_ENV = mode
    if (shareUrl === undefined) delete env.SHARE_URL
    else env.SHARE_URL = shareUrl
  }

  test("validates the environment on every call outside production", () => {
    try {
      env.SHARE_URL = "https://one.example"
      expect(getConfig().shareUrl).toBe("https://one.example")
      env.SHARE_URL = "https://two.example"
      expect(getConfig().shareUrl).toBe("https://two.example")
    } finally {
      restore()
    }
  })

  test("validates the environment once in production", () => {
    try {
      env.NODE_ENV = "production"
      env.SHARE_URL = "https://one.example"
      const first = getConfig()
      env.SHARE_URL = "https://two.example"
      expect(getConfig()).toBe(first)
      expect(getConfig().shareUrl).toBe("https://one.example")
      // An explicit environment is always read as given.
      expect(getConfig({ ...env }).shareUrl).toBe("https://two.example")
    } finally {
      restore()
    }
  })
})
