import { afterEach, describe, expect, test } from "bun:test"
import {
  getAnalyticsPreference,
  isAnalyticsExcluded,
  setAnalyticsPreference,
} from "@/lib/analytics-preference"

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window")

afterEach(() => {
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow)
  else Reflect.deleteProperty(globalThis, "window")
})

function browser(pathname = "/dashboard") {
  const values = new Map<string, string>()
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  }
  const location = { pathname }
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage, location },
  })
  return { values, localStorage, location }
}

describe("analytics browser preference", () => {
  test("includes ordinary visits without writing browser storage", () => {
    const { values } = browser()
    expect(getAnalyticsPreference()).toBe("included")
    expect(isAnalyticsExcluded()).toBe(false)
    expect(values.size).toBe(0)
  })

  test("persists exclusion and removes it when included again", () => {
    const { values } = browser()
    expect(setAnalyticsPreference("excluded")).toBe("excluded")
    expect(getAnalyticsPreference()).toBe("excluded")
    expect(isAnalyticsExcluded()).toBe(true)
    expect(values.size).toBe(1)
    expect(setAnalyticsPreference("included")).toBe("included")
    expect(isAnalyticsExcluded()).toBe(false)
    expect(values.size).toBe(0)
  })

  test("always excludes the preference page without changing saved state", () => {
    for (const path of ["/_site/analytics", "/_site/analytics/", "/%5Fsite/analytics"]) {
      const { values } = browser(path)
      expect(isAnalyticsExcluded()).toBe(true)
      expect(getAnalyticsPreference()).toBe("included")
      expect(values.size).toBe(0)
    }
  })

  test("rechecks the preference when another tab changes it", () => {
    const { values } = browser()
    expect(setAnalyticsPreference("excluded")).toBe("excluded")
    expect(isAnalyticsExcluded()).toBe(true)
    values.clear()
    expect(isAnalyticsExcluded()).toBe(false)
  })

  test("stops analytics when storage cannot be read", () => {
    const current = browser()
    current.localStorage.getItem = () => {
      throw new Error("Storage blocked")
    }
    expect(getAnalyticsPreference()).toBe("unavailable")
    expect(isAnalyticsExcluded()).toBe(true)
  })

  test("reports a failed save or removal without claiming success", () => {
    const current = browser()
    current.localStorage.setItem = () => {
      throw new Error("Storage full")
    }
    expect(setAnalyticsPreference("excluded")).toBe("unavailable")
    current.localStorage.removeItem = () => {
      throw new Error("Storage blocked")
    }
    expect(setAnalyticsPreference("included")).toBe("unavailable")
  })

  test("handles a browser that denies access to the storage object", () => {
    browser()
    Object.defineProperty(window, "localStorage", {
      get: () => {
        throw new Error("SecurityError")
      },
    })
    expect(isAnalyticsExcluded()).toBe(true)
    expect(setAnalyticsPreference("excluded")).toBe("unavailable")
  })
})
