// The widgets, sizes and templates saved in account preferences. Shared by the page and its
// customization controls, so this file stays free of server imports.

export const WIDGETS = [
  "agents",
  "agent_activity",
  "agent_pastes",
  "recent_pastes",
  "starred",
  "expiring",
  "popular",
  "secrets",
  "collections",
] as const

export type WidgetId = (typeof WIDGETS)[number]
export type WidgetSize = "small" | "large"
export type WidgetSizes = Partial<Record<WidgetId, WidgetSize>>

// Default widths preserve existing dashboards; every widget can override its size.
const WIDE_WIDGETS: ReadonlySet<WidgetId> = new Set([
  "agents",
  "agent_activity",
  "agent_pastes",
  "recent_pastes",
  "starred",
])

export function widgetSize(widget: WidgetId, sizes: WidgetSizes): WidgetSize {
  return sizes[widget] ?? (WIDE_WIDGETS.has(widget) ? "large" : "small")
}

export function cleanWidgetSizes(value: unknown): WidgetSizes {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter(
      ([widget, size]) => isWidget(widget) && (size === "small" || size === "large"),
    ),
  )
}

export const TEMPLATES = {
  agents: ["agents", "agent_activity", "agent_pastes", "recent_pastes"],
  sharing: ["recent_pastes", "popular", "expiring"],
  secrets: ["agents", "secrets", "collections", "recent_pastes"],
  blank: [],
} as const satisfies Record<string, readonly WidgetId[]>

export type TemplateId = keyof typeof TEMPLATES
export const TEMPLATE_IDS = Object.keys(TEMPLATES) as TemplateId[]

// A dashboard nobody has arranged yet starts from the Agents template.
export const DEFAULT_LAYOUT: readonly WidgetId[] = TEMPLATES.agents

export function isWidget(value: unknown): value is WidgetId {
  return typeof value === "string" && (WIDGETS as readonly string[]).includes(value)
}

// Known widgets, each once, in the order given. Anything else in a saved layout is dropped.
export function cleanLayout(values: readonly unknown[]): WidgetId[] {
  return [...new Set(values.filter(isWidget))]
}
