import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dir, "../../..")
const read = (file: string) => JSON.parse(readFileSync(path.join(root, file), "utf8"))
const endpoint = "https://app.sniptide.com/api/mcp"
const skills = [
  "apply-collection",
  "integrate-sniptide-sdk",
  "reuse-snippets",
  "save-snippets",
  "setup-sniptide",
]
const tokenSkills = ["integrate-sniptide-sdk", "setup-sniptide"]

// The Gemini CLI extension and the Claude Code plugin are read straight from the repository, so
// they must name the hosted endpoint and share one version and description.
describe("agent plugin manifests", () => {
  const gemini = read("gemini-extension.json")
  const claude = read("plugins/claude/.claude-plugin/plugin.json")
  const marketplace = read(".claude-plugin/marketplace.json")

  test("point at the hosted MCP endpoint without credentials", () => {
    expect(gemini.mcpServers).toEqual({ sniptide: { httpUrl: endpoint } })
    expect(claude.mcpServers).toEqual({
      sniptide: {
        type: "http",
        url: endpoint,
        headers: { Authorization: "Bearer ${user_config.api_token}" },
      },
    })
    expect(JSON.stringify(gemini)).not.toMatch(/authorization|bearer|token/i)
  })

  // The Claude Code plugin takes an optional token as a plugin setting. Claude Code keeps a
  // sensitive value in its credential store, so the manifest holds only the placeholder.
  test("take the Claude Code token from a sensitive plugin setting", () => {
    expect(claude.userConfig.api_token).toMatchObject({ type: "string", sensitive: true })
    expect(claude.userConfig.api_token.required).not.toBe(true)
    expect(claude.supportUrl).toBe("https://github.com/Dino-Kupinic/sniptide/issues")
    expect(JSON.stringify(claude)).not.toMatch(/SNIPTIDE_TOKEN|Bearer [A-Za-z0-9]/)
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
  // manifest, the icon, the README, the license and copies of the five skills. Gemini CLI and the
  // root Agent Plugin read the skills from skills/, so a copy matches its source exactly unless it
  // handles the token.
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
      ...skills.map((name) => `skills/${name}/SKILL.md`),
    ])
    for (const name of skills) {
      const copy = readFileSync(path.join(dir, "skills", name, "SKILL.md"))
      const source = readFileSync(path.join(root, "skills", name, "SKILL.md"))
      if (tokenSkills.includes(name)) {
        // These two read the token from the environment at the root. The plugin copies point to
        // the plugin setting and use a placeholder instead.
        expect(copy.toString()).not.toContain("SNIPTIDE_TOKEN")
        expect(copy.toString()).toContain("YOUR_API_KEY")
      } else {
        expect(copy).toEqual(source)
      }
    }
    expect(claude.icon).toBe(".claude-plugin/icon.png")
    expect(claude.privacyPolicyUrl).toBe("https://sniptide.com/privacy")
    expect(claude.license).toBe("AGPL-3.0-only")
    expect(readFileSync(path.join(dir, "LICENSE"), "utf8")).toBe(
      readFileSync(path.join(root, "LICENSE"), "utf8"),
    )
  })
})
