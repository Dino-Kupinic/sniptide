import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dir, "../../..")
const read = (file: string) => JSON.parse(readFileSync(path.join(root, file), "utf8"))
const endpoint = "https://app.sniptide.com/api/mcp"

// The Gemini CLI extension and the Claude Code plugin are read straight from the repository, so
// they must name the hosted endpoint and share one version and description.
describe("agent plugin manifests", () => {
  const gemini = read("gemini-extension.json")
  const claude = read("plugins/claude/.claude-plugin/plugin.json")
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

  test("list plugins/claude as the marketplace plugin", () => {
    expect(marketplace.name).toBe("sniptide")
    expect(marketplace.plugins).toEqual([{ name: "sniptide", source: "./plugins/claude" }])
  })

  // The plugin directory scans everything under the plugin source, so the folder holds only the
  // manifest, the icon, the README and the license, and the icon path resolves inside it.
  test("keep the Claude Code plugin folder minimal", () => {
    const dir = path.join(root, "plugins/claude")
    const files = readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
      .sort()
    expect(files).toEqual([
      ".claude-plugin/icon.png",
      ".claude-plugin/plugin.json",
      "LICENSE",
      "README.md",
    ])
    expect(claude.icon).toBe(".claude-plugin/icon.png")
    expect(claude.privacyPolicyUrl).toBe("https://sniptide.com/privacy")
    expect(claude.license).toBe("AGPL-3.0-only")
    expect(readFileSync(path.join(dir, "LICENSE"), "utf8")).toBe(
      readFileSync(path.join(root, "LICENSE"), "utf8"),
    )
  })
})
