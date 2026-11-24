import { describe, expect, test } from "bun:test"
import { llmsIndex, markdownPath, pageMarkdown } from "./markdown"

describe("page Markdown", () => {
  test("is served under /llms.mdx", () => {
    expect(markdownPath([])).toBe("/llms.mdx")
    expect(markdownPath(["self-hosting", "backups"])).toBe("/llms.mdx/self-hosting/backups")
  })

  test("drops heading ids and makes links between pages absolute", () => {
    const markdown = pageMarkdown({
      title: "CLI",
      description: "Install the CLI.",
      url: "/cli",
      body: "## Install [#install]\n\nSee [API tokens](/api-tokens#create) or [GitHub](https://github.com).\n",
    })
    expect(markdown).toBe(
      "# CLI\n\nSource: https://docs.sniptide.com/cli\n\nInstall the CLI.\n\n## Install\n\n" +
        "See [API tokens](https://docs.sniptide.com/api-tokens#create) or [GitHub](https://github.com).\n",
    )
  })
})

describe("llms.txt", () => {
  test("lists each section's pages with links to their Markdown", () => {
    const index = llmsIndex("Sniptide docs", "Guides for Sniptide.", [
      {
        name: "Get started",
        pages: [
          { title: "Overview", description: "What Sniptide does.", slugs: [] },
          { title: "Backups", slugs: ["self-hosting", "backups"] },
        ],
      },
      { name: "Empty", pages: [] },
    ])
    expect(index).toBe(
      "# Sniptide docs\n\n> Guides for Sniptide.\n\n## Get started\n\n" +
        "- [Overview](https://docs.sniptide.com/llms.mdx): What Sniptide does.\n" +
        "- [Backups](https://docs.sniptide.com/llms.mdx/self-hosting/backups)\n",
    )
  })
})
