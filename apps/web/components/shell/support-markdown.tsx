import type * as React from "react"

// The little Markdown the assistant writes: paragraphs, bullet lists, links, inline code and bold.
// Built as React nodes, never as HTML, so a reply can't inject markup.

const INLINE = /(\[[^\]]+\]\([^)\s]+\)|`[^`]+`|\*\*[^*]+\*\*)/g

function inline(text: string, key: string): React.ReactNode[] {
  return text.split(INLINE).map((part, index) => {
    const id = `${key}-${index}`
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)
    if (link) {
      const href = link[2] ?? ""
      return /^https?:\/\//.test(href) ? (
        <a
          key={id}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-link underline underline-offset-2"
        >
          {link[1]}
        </a>
      ) : (
        link[1]
      )
    }
    if (/^`[^`]+`$/.test(part))
      return (
        <code key={id} className="rounded-sm bg-muted px-1 font-mono text-[13px]">
          {part.slice(1, -1)}
        </code>
      )
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={id}>{part.slice(2, -2)}</strong>
    return part
  })
}

export function SupportMarkdown({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/)
  return blocks.map((block, index) => {
    const key = `b${index}`
    const lines = block.split("\n")
    if (lines.every((line) => /^\s*([-*]|\d+\.)\s+/.test(line))) {
      return (
        <ul key={key} className="list-disc space-y-1 pl-5">
          {lines.map((line, lineIndex) => (
            <li key={lineIndex}>
              {inline(line.replace(/^\s*([-*]|\d+\.)\s+/, ""), `${key}-${lineIndex}`)}
            </li>
          ))}
        </ul>
      )
    }
    return <p key={key}>{inline(lines.join(" "), key)}</p>
  })
}
