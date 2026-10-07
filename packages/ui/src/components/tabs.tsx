"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cn } from "cn"

const Tabs = TabsPrimitive.Root
const TabsPanel = TabsPrimitive.Panel

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn("flex items-center gap-1", className)}
      {...props}
    />
  )
}

function TabsTab({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-tab"
      className={cn(
        "inline-flex h-8 items-center px-3 text-sm whitespace-nowrap text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 data-active:border data-active:border-border data-active:bg-background data-active:text-foreground",
        className,
      )}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsPanel, TabsTab }
