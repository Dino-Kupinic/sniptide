import { describe, expect, test } from "bun:test"
import { grammarFor, highlightFiles } from "@/lib/highlight/highlight"
import type { HighlightedLines } from "@/lib/highlight/types"

const samples: Record<string, { name: string; code: string }> = {
  typescript: {
    name: "a.ts",
    code: "const answer: number = 42 // done\nexport function f(x: string) { return x + 1 }",
  },
  javascript: {
    name: "a.js",
    code: "const f = (x) => x.map((y) => y + 1)\nconsole.log('hi', null)",
  },
  sql: { name: "a.sql", code: "SELECT id, name FROM users WHERE id = 1 -- first" },
  shell: { name: "a.sh", code: 'export PORT=3000\nif [ -n "$HOME" ]; then echo "$HOME"; fi' },
  python: { name: "a.py", code: 'def f(x: int) -> str:\n    return f"{x}"  # comment' },
  nginx: {
    name: "nginx.conf",
    code: "server {\n  listen 80;\n  location / { proxy_pass http://app; }\n}",
  },
  docker: {
    name: "Dockerfile",
    code: 'FROM node:24-slim\nRUN bun install\nCMD ["node", "server.js"]',
  },
  yaml: { name: "a.yaml", code: "services:\n  web:\n    image: node:24\n    ports: [3000]" },
  go: { name: "a.go", code: 'package main\n\nfunc main() {\n\tfmt.Println("hi", 1)\n}' },
  hcl: { name: "main.hcl", code: 'resource "aws_s3_bucket" "b" {\n  bucket = "x"\n}' },
  json: { name: "a.json", code: '{ "name": "sniptide", "private": true, "n": 1 }' },
  markdown: {
    name: "a.md",
    code: "# Title\n\nSome `code` and a [link](https://example.com)\n\n- item",
  },
}

const text = (lines: HighlightedLines) =>
  lines.map((line) => line.map((token) => (typeof token === "string" ? token : token[0])).join(""))

describe("highlightFiles", () => {
  for (const [language, { name, code }] of Object.entries(samples)) {
    test(`colours ${language} and keeps every character`, async () => {
      const [file] = await highlightFiles([{ name, language, content: code }])
      expect(file?.lines).toBeDefined()
      expect(text(file?.lines ?? [])).toEqual(code.split("\n"))
      expect(file?.lines?.flat().some((token) => Array.isArray(token))).toBe(true)
    })
  }

  test("leaves plain text alone", async () => {
    const files = [{ name: "notes.txt", language: "text", content: "hello" }]
    expect(await highlightFiles(files)).toEqual(files)
  })

  test("drops one trailing newline, like the code view", async () => {
    const [file] = await highlightFiles([
      { name: "a.json", language: "json", content: '{ "a": 1 }\n' },
    ])
    expect(file?.lines).toHaveLength(1)
  })

  test("skips files too large to ship as tokens", async () => {
    const content = "const a = 1\n".repeat(2001)
    const [file] = await highlightFiles([{ name: "big.ts", language: "typescript", content }])
    expect(file?.lines).toBeUndefined()
  })

  test("picks a closer grammar from the file name", () => {
    expect(grammarFor({ name: "App.tsx", language: "typescript" })).toBe("tsx")
    expect(grammarFor({ name: "App.jsx", language: "javascript" })).toBe("jsx")
    expect(grammarFor({ name: "main.tf", language: "hcl" })).toBe("terraform")
    expect(grammarFor({ name: "docker-compose.yml", language: "docker" })).toBe("yaml")
    expect(grammarFor({ name: "Dockerfile", language: "docker" })).toBe("dockerfile")
    expect(grammarFor({ name: "notes.txt", language: "text" })).toBeUndefined()
  })
})
