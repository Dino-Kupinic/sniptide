import { cn } from "@sniptide/ui/lib/utils"
import { CodeBlockTabs as BaseCodeBlockTabs } from "fumadocs-ui/components/codeblock"
import { Tab as BaseTab, Tabs as BaseTabs } from "fumadocs-ui/components/tabs"
import type { ComponentProps } from "react"

// Fumadocs' tabs with the app's look: a hairline panel whose tab row sits on the fill, and the
// active tab raised onto the page colour with a hairline, as in packages/ui tabs. The row and the
// code blocks inside a panel are styled in app/global.css under .docs-tabs. Class names are passed
// as strings because these render on the server and Fumadocs' tabs are client components.
type TabsProps = Omit<ComponentProps<typeof BaseTabs>, "className"> & { className?: string }
type TabProps = Omit<ComponentProps<typeof BaseTab>, "className"> & { className?: string }

export function Tabs({ className, ...props }: TabsProps) {
  return (
    <BaseTabs {...props} className={cn("docs-tabs my-6 rounded-lg border bg-card", className)} />
  )
}

export function Tab({ className, ...props }: TabProps) {
  return (
    <BaseTab {...props} className={cn("rounded-none bg-transparent p-4 text-base", className)} />
  )
}

type CodeBlockTabsProps = Omit<ComponentProps<typeof BaseCodeBlockTabs>, "className"> & {
  className?: string
}

// Package-manager tabs (from an ```npm block) and other code groups share the tab look above, with
// the code running edge to edge below the row.
export function CodeBlockTabs({ className, ...props }: CodeBlockTabsProps) {
  return (
    <BaseCodeBlockTabs
      {...props}
      className={cn("docs-tabs code-tabs my-6 rounded-lg", className)}
    />
  )
}
