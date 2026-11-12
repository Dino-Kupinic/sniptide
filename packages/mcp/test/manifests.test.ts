import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dir, "../../..")
const read = (file: string) => JSON.parse(readFileSync(path.join(root, file), "utf8"))
const endpoint = "https://app.sniptide.com/api/mcp"

// The Gemini CLI extension and the Claude Code plugin are read straight from the repository, so
// they must name the hosted endpoint and share one version and description.
describe("agent plugin manifests", () => {
  const gemini = read("gemini-extension.json")
  const claude = read(".claude-plugin/plugin.json")
  const marketplace = read(".claude-plugin/marketplace.json")

  test("point at the hosted MCP endpoint without credentials", () => {
    expect(gemini.mcpServers).toEqual({ sniptide: { httpUrl: endpoint } })
    expect(claude.mcpServers).toEqual({ sniptide: { type: "http", url: endpoint } })
    expect(JSON.stringify([gemini, claude])).not.toMatch(/authorization|bearer|token/i)
  })

  test("share one name, version and description", () => {
    expect(gemini.name).toBe("sniptide")
    expect(claude.name).toBe("sniptide")
    expect(gemini.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(claude.version).toBe(gemini.version)
    expect(claude.description).toBe(gemini.description)
  })

  test("list the repository root as the marketplace plugin", () => {
    expect(marketplace.plugins).toEqual([{ name: "sniptide", source: "./" }])
  })
})
