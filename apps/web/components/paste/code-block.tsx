import { cn } from "@sniptide/ui/lib/utils"

// Line-numbered code in JetBrains Mono, monochrome like the Paper designs. Each line is its own
// row so a wrapped line keeps its number aligned with its first visual line.
export function CodeBlock({
  content,
  wrap = false,
  maxLines,
  lineNumbers = true,
  className,
}: {
  content: string
  wrap?: boolean
  maxLines?: number
  lineNumbers?: boolean
  className?: string
}) {
  const lines = content.replace(/\n$/, "").split("\n")
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
              {line || " "}
            </code>
          </li>
        ))}
      </ol>
    </div>
  )
}
