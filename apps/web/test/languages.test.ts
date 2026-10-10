import { describe, expect, test } from "bun:test"
import { getLanguage, renameForLanguage } from "@/lib/pastes/languages"

// Picking a language in the editor renames the file, since the language comes from its name.

describe("renameForLanguage", () => {
  test("swaps the extension and keeps the name", () => {
    expect(renameForLanguage("untitled.txt", getLanguage("typescript"))).toBe("untitled.ts")
    expect(renameForLanguage("backup.sh", getLanguage("python"))).toBe("backup.py")
  })

  test("adds an extension to a bare name", () => {
    expect(renameForLanguage("notes", getLanguage("markdown"))).toBe("notes.md")
  })

  test("leaves a name that already matches alone", () => {
    expect(renameForLanguage("app.tsx", getLanguage("typescript"))).toBe("app.tsx")
  })

  test("uses the whole-name files for Docker and Nginx, and leaves them cleanly", () => {
    expect(renameForLanguage("build.txt", getLanguage("docker"))).toBe("Dockerfile")
    expect(renameForLanguage("site.txt", getLanguage("nginx"))).toBe("nginx.conf")
    expect(renameForLanguage("Dockerfile", getLanguage("yaml"))).toBe("untitled.yaml")
  })
})
