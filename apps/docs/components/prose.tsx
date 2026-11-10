import { cn } from "@sniptide/ui/lib/utils"
import {
  File as FileIcon,
  Folder as FolderIcon,
  Info,
  Lightbulb,
  TriangleAlert,
} from "lucide-react"
import type { HTMLAttributes, ReactNode } from "react"

// Custom MDX components for the docs' reading flow. They render on the server, use the tokens from
// @sniptide/ui, and keep their text in the page so search and the exported Markdown still read well.

type CalloutType = "info" | "note" | "tip" | "warn" | "warning"

const calloutIcons = {
  info: { icon: Info, className: "text-link" },
  tip: { icon: Lightbulb, className: "text-link" },
  warning: { icon: TriangleAlert, className: "text-foreground" },
} as const

function calloutKind(type: CalloutType) {
  if (type === "warn" || type === "warning") return "warning"
  if (type === "tip") return "tip"
  return "info"
}

export type CalloutProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  type?: CalloutType
  title?: ReactNode
}

// A constraint, warning or shortcut beside the main flow: a hairline panel one fill step above the
// page, with a 16px icon whose shape names the kind. The text stays in the foreground colour so a
// warning reads at full contrast, and red stays reserved for destructive actions.
export function Callout({ type = "info", title, className, children, ...props }: CalloutProps) {
  const kind = calloutKind(type)
  const { icon: Icon, className: iconClass } = calloutIcons[kind]
  return (
    <div
      role="note"
      data-callout={kind}
      {...props}
      className={cn(
        "my-6 flex gap-3 rounded-lg border bg-muted/50 px-4 py-3.5 text-[0.9375rem] leading-6",
        className,
      )}
    >
      <Icon aria-hidden className={cn("mt-1 size-4 shrink-0", iconClass)} />
      <div className="min-w-0 flex-1 text-foreground [&>*]:my-0 [&>*+*]:mt-3 [&>[data-title]+*]:mt-1 [&_p]:leading-6">
        {title && (
          <p data-title className="font-medium">
            {title}
          </p>
        )}
        {children}
      </div>
    </div>
  )
}

export type ParamsProps = HTMLAttributes<HTMLDListElement>

// Reference entries for a function's or command's inputs. Each entry is one row: the name and type
// in mono, a Required mark or the default, then the description in full sentences below. A list
// keeps long descriptions readable where a four-column table would squeeze them into fragments.
export function Params({ className, ...props }: ParamsProps) {
  return (
    <dl
      {...props}
      className={cn("not-prose my-6 divide-y overflow-hidden rounded-lg border", className)}
    />
  )
}

export type ParamProps = {
  name: string
  type?: string
  default?: string
  required?: boolean
  children?: ReactNode
}

export function Param({ name, type, default: fallback, required, children }: ParamProps) {
  return (
    <div className="px-4 py-3.5">
      <dt className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <code className="font-mono text-sm font-medium text-foreground">{name}</code>
        {type && <code className="font-mono text-[0.8125rem] text-link">{type}</code>}
        {required ? (
          <span className="text-[0.8125rem] font-medium text-foreground">Required</span>
        ) : (
          fallback && (
            <span className="text-[0.8125rem] text-muted-foreground">
              Default <code className="font-mono text-foreground">{fallback}</code>
            </span>
          )
        )}
      </dt>
      {children && (
        <dd className="mt-1.5 text-[0.9375rem] leading-6 text-muted-foreground [&_code]:rounded-md [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.8125em] [&_code]:text-foreground [&_p]:m-0">
          {children}
        </dd>
      )}
    </div>
  )
}

export type FilesProps = HTMLAttributes<HTMLDivElement> & { label?: string }

// A folder layout, such as what an install writes to disk. Rows are mono names with a 16px icon,
// nested folders indent on a hairline, and a row can carry one line on what the file is for. The
// tree is a nested list, so screen readers announce its depth and count.
export function Files({ label, className, children, ...props }: FilesProps) {
  return (
    <div
      {...props}
      className={cn("not-prose my-6 overflow-hidden rounded-lg border bg-card", className)}
    >
      {label && (
        <div className="border-b px-4 py-2 font-mono text-xs text-muted-foreground">{label}</div>
      )}
      <ul className="p-2" aria-label={label}>
        {children}
      </ul>
    </div>
  )
}

const rowClass =
  "flex min-h-8 items-baseline gap-x-3 gap-y-0.5 rounded-md px-2 py-1.5 max-sm:flex-col"

type EntryProps = { name: string; children?: ReactNode }

export function Folder({ name, children, note }: EntryProps & { note?: ReactNode }) {
  return (
    <li>
      <div className={rowClass}>
        <span className="flex items-baseline gap-2 font-mono text-[0.8125rem] text-foreground">
          <FolderIcon aria-hidden className="size-4 shrink-0 self-center text-muted-foreground" />
          {name}
        </span>
        {note && <span className="text-sm text-muted-foreground">{note}</span>}
      </div>
      {children && <ul className="ms-[15px] border-s ps-2">{children}</ul>}
    </li>
  )
}

export function File({ name, children }: EntryProps) {
  return (
    <li className={rowClass}>
      <span className="flex shrink-0 items-baseline gap-2 font-mono text-[0.8125rem] text-foreground">
        <FileIcon aria-hidden className="size-4 shrink-0 self-center text-muted-foreground" />
        {name}
      </span>
      {children && <span className="text-sm leading-5 text-muted-foreground">{children}</span>}
    </li>
  )
}
