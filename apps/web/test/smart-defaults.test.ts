import { describe, expect, test } from "bun:test"
import { detectLanguage } from "@/lib/pastes/languages"
import {
  detectContentLanguage,
  hasSensitiveContent,
  suggestedFilename,
  suggestedTitle,
  suggestedVisibility,
} from "@/lib/pastes/smart-defaults"

describe("paste suggestions", () => {
  test.each([
    ["typescript", "export function greet(name: string) { return name }"],
    ["typescript", "const greet = (name: string) => name"],
    ["javascript", "const greet = (name) => console.log(name)"],
    ["python", "def greet(name):\n    print(name)"],
    ["shell", "#!/bin/bash\necho hello"],
    ["sql", "SELECT\n  name\nFROM users;"],
    ["json", '{"name":"hello","items":[1,2]}'],
    ["yaml", "name: hello\nversion: 1\n"],
    ["go", 'package main\nfunc main() { println("hello") }'],
    ["rust", 'fn main() { println!("hello"); }'],
    ["java", "public class Main { public static void main(String[] args) {} }"],
    ["html", "<!doctype html><html><body>Hello</body></html>"],
    ["css", ".hello { color: red; }"],
    ["markdown", "# Deployment guide\n\nSome notes."],
    ["text", "some ordinary notes without code"],
  ])("detects %s and saves it through the filename", (language, content) => {
    expect(detectContentLanguage(content).id).toBe(language)
    expect(detectLanguage(suggestedFilename({ name: "untitled.txt", content })).id).toBe(language)
  })

  test("keeps a meaningful filename even when its extension is unknown", () => {
    const content = 'print("hello")'
    expect(suggestedFilename({ name: "notes.custom", content })).toBe("notes.custom")
    expect(suggestedFilename({ name: "notes.txt", content })).toBe("notes.txt")
    expect(suggestedFilename({ name: "main.rs", content })).toBe("main.rs")
  })

  test("uses the first nonempty line, strips comment markers and bounds a title", () => {
    expect(
      suggestedTitle([
        { name: "untitled.js", content: "/*\n * Greeting\n */\nconsole.log('hello')" },
      ]),
    ).toBe("Greeting")
    expect(suggestedTitle([{ name: "untitled.js", content: "/*\n */\n//" }])).toBe("untitled.js")
    expect(suggestedTitle([{ name: "untitled.py", content: "\n# Greeting\nprint('hello')" }])).toBe(
      "Greeting",
    )
    expect(suggestedTitle([{ name: "deploy.sh", content: "echo hello" }])).toBe("deploy.sh")
    expect(suggestedTitle([{ name: "untitled.txt", content: "x".repeat(200) }])).toHaveLength(120)
    expect(suggestedTitle([{ name: "untitled.txt", content: "" }])).toBe("")
  })

  test.each([
    { name: ".env", content: "DEBUG=true" },
    { name: ".env.production", content: "lowercase=value" },
    { name: "config/app.env", content: "lowercase=value" },
    { name: "untitled.txt", content: "DATABASE_PASSWORD=example" },
    { name: "untitled.txt", content: "-----BEGIN PRIVATE KEY-----\nexample" },
  ])("defaults sensitive $name to private without putting its content in the title", (file) => {
    expect(hasSensitiveContent([file])).toBe(true)
    expect(suggestedVisibility([file], "public")).toBe("private")
    expect(suggestedTitle([file])).toBe(file.name)
  })

  test("keeps the chosen visibility for ordinary files", () => {
    expect(suggestedVisibility([{ name: "hello.py", content: "print('hello')" }], "public")).toBe(
      "public",
    )
  })
})
