import { expect, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { CodeBlock } from "@/components/paste/code-block"
import { sharedViewerProps } from "@/components/paste/shared-paste-view"

test("code blocks keep long lines on one row unless wrapping is requested", () => {
  const long = "x".repeat(300)
  const plain = renderToStaticMarkup(createElement(CodeBlock, { content: long }))
  expect(plain).toContain("whitespace-pre")
  expect(plain).not.toContain("whitespace-pre-wrap")
  expect(plain).toContain("w-max")

  const wrapped = renderToStaticMarkup(createElement(CodeBlock, { content: long, wrap: true }))
  expect(wrapped).toContain("whitespace-pre-wrap")
})

test("the shared code card shows its file tabs header for one file and for several", () => {
  expect(sharedViewerProps(true).bodyClassName).toBe("bg-sidebar")
  expect("headerClassName" in sharedViewerProps(true)).toBe(false)
})
