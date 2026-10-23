import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import path from "node:path"
import { grammarLoaders } from "@/lib/highlight/grammars"
import {
  detectLanguage,
  getLanguage,
  languages,
  matchesLanguage,
  pickerGroups,
  popularLanguageIds,
  renameForLanguage,
} from "@/lib/pastes/languages"

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

describe("the language table", () => {
  test("covers every grammar Shiki ships", () => {
    const grammars = new Set(languages.map((language) => language.grammar ?? language.id))
    for (const id of Object.keys(grammarLoaders)) {
      if (["tsx", "jsx", "html-derivative"].includes(id)) continue
      expect(grammars.has(id)).toBe(true)
    }
  })

  test("names every file so it detects as the language picked for it", () => {
    for (const language of languages) {
      expect(detectLanguage(renameForLanguage("untitled.txt", language)).id).toBe(language.id)
    }
  })

  test("has a loader for every grammar and a logo for every language", () => {
    for (const language of languages) {
      if (language.id !== "text")
        expect(grammarLoaders[language.grammar ?? language.id]).toBeDefined()
      const dir = path.join(import.meta.dirname, "../public/languages")
      expect(existsSync(path.join(dir, `${language.icon}.svg`))).toBe(true)
      if (language.iconLight)
        expect(existsSync(path.join(dir, `${language.icon}-light.svg`))).toBe(true)
    }
  })

  test("keeps the ids pastes were stored with", () => {
    for (const id of ["typescript", "javascript", "sql", "shell", "python", "nginx", "docker"])
      expect(getLanguage(id).id).toBe(id)
    for (const id of ["yaml", "go", "hcl", "json", "markdown", "text"])
      expect(getLanguage(id).id).toBe(id)
    expect(detectLanguage("deploy.sh").id).toBe("shell")
    expect(detectLanguage("docker-compose.yml").id).toBe("docker")
    expect(detectLanguage("App.tsx").id).toBe("typescript")
  })

  test("detects languages beyond the original twelve", () => {
    expect(detectLanguage("main.rs").id).toBe("rust")
    expect(detectLanguage("Main.java").id).toBe("java")
    expect(detectLanguage("Makefile").id).toBe("make")
    expect(detectLanguage("main.tf").id).toBe("terraform")
  })

  test("lists the popular languages first, then the rest by name", () => {
    const [popular, rest] = pickerGroups
    expect(popular?.items.map((language) => language.id).slice(0, 10)).toEqual(popularLanguageIds)
    expect(rest?.items.some((language) => popularLanguageIds.includes(language.id))).toBe(false)
    const names = rest?.items.map((language) => language.name) ?? []
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")))
    expect((popular?.items.length ?? 0) + names.length).toBe(languages.length)
  })

  test("search matches names and extensions", () => {
    expect(matchesLanguage(getLanguage("rust"), "rs")).toBe(true)
    expect(matchesLanguage(getLanguage("rust"), ".rs")).toBe(true)
    expect(matchesLanguage(getLanguage("csharp"), "c#")).toBe(true)
    expect(matchesLanguage(getLanguage("python"), "rust")).toBe(false)
  })
})
