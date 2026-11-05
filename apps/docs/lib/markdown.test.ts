import { describe, expect, test } from "bun:test"
import { markdownPath, pageMarkdown } from "./markdown"

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
