import { cn } from "@sniptide/ui/lib/utils"
import type { HighlightedLines, HighlightedToken, HighlightRole } from "@/lib/highlight/types"

// Colours come from the --syntax-* variables, which switch with the theme.
const roleClass: Record<HighlightRole, string> = {
  keyword: "text-(color:--syntax-keyword)",
  string: "text-(color:--syntax-string)",
  constant: "text-(color:--syntax-constant)",
  function: "text-(color:--syntax-function)",
  type: "text-(color:--syntax-type)",
  property: "text-(color:--syntax-property)",
  comment: "text-(color:--syntax-comment) italic",
  punctuation: "text-(color:--syntax-punctuation)",
  heading: "text-(color:--syntax-keyword) font-semibold",
  link: "text-(color:--syntax-link)",
  invalid: "text-(color:--syntax-invalid)",
}

export function renderToken(token: HighlightedToken, index: number) {
  if (typeof token === "string") return token
  return (
    <span key={index} className={roleClass[token[1]]}>
      {token[0]}
    </span>
  )
}

// Line-numbered code in JetBrains Mono. Plain ink unless the page passes `highlighted` lines
// (see lib/highlight), then syntax-coloured. Each line is its own row so a wrapped line keeps its
// number aligned with its first visual line.
export function CodeBlock({
  content,
  highlighted,
  wrap = false,
  maxLines,
  lineNumbers = true,
  className,
}: {
  content: string
  highlighted?: HighlightedLines
  wrap?: boolean
  maxLines?: number
  lineNumbers?: boolean
  className?: string
}) {
  const lines = highlighted ?? content.replace(/\n$/, "").split("\n")
  const visible = maxLines ? lines.slice(0, maxLines) : lines
  const gutter = `${String(lines.length).length}ch`

  return (
    <div className={cn("overflow-x-auto p-4 font-mono text-[13px] leading-[22px]", className)}>
      <ol className={cn("min-w-full", !wrap && "w-max")}>
        {visible.map((line, index) => (
          <li key={index} className="flex gap-[18px]">
            <span
              hidden={!lineNumbers}
              aria-hidden="true"
              style={{ minWidth: gutter }}
              className="shrink-0 text-right text-muted-foreground/60 select-none"
            >
              {index + 1}
            </span>
            <code
              className={cn("min-w-0", wrap ? "break-words whitespace-pre-wrap" : "whitespace-pre")}
            >
              {typeof line === "string" ? line || " " : line.length ? line.map(renderToken) : " "}
            </code>
          </li>
        ))}
      </ol>
    </div>
  )
}
