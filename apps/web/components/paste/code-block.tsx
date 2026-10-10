import { cn } from "@sniptide/ui/lib/utils"

// Line-numbered code in JetBrains Mono, monochrome like the Paper designs. Each line is its own
// row so a wrapped line keeps its number aligned with its first visual line. `wrap="mobile"` and
// `mobileMaxLines` only apply below the lg breakpoint, so one render serves both layouts.
export function CodeBlock({
  content,
  wrap = false,
  mobileMaxLines,
  lineNumbers = true,
  className,
}: {
  content: string
  wrap?: boolean | "mobile"
  mobileMaxLines?: number
  lineNumbers?: boolean
  className?: string
}) {
  const lines = content.replace(/\n$/, "").split("\n")
  const gutter = `${String(lines.length).length}ch`

  return (
    <div className={cn("overflow-x-auto p-4 font-mono text-[13px] leading-[22px]", className)}>
      <ol className={cn("min-w-full", !wrap && "w-max", wrap === "mobile" && "lg:w-max")}>
        {lines.map((line, index) => (
          <li
            key={index}
            className={cn(
              "flex gap-[18px]",
              mobileMaxLines !== undefined && index >= mobileMaxLines && "max-lg:hidden",
            )}
          >
            <span
              hidden={!lineNumbers}
              aria-hidden="true"
              style={{ minWidth: gutter }}
              className="shrink-0 text-right text-muted-foreground/60 select-none"
            >
              {index + 1}
            </span>
            <code
              className={cn(
                "min-w-0",
                wrap === true && "break-words whitespace-pre-wrap",
                wrap === false && "whitespace-pre",
                wrap === "mobile" &&
                  "break-words whitespace-pre-wrap lg:break-normal lg:whitespace-pre",
              )}
            >
              {line || " "}
            </code>
          </li>
        ))}
      </ol>
    </div>
  )
}
