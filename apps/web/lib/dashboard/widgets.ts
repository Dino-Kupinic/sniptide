// The widgets a dashboard can hold and the templates that fill it. The layout is an ordered list
// of widget ids saved in the account's preferences, so this file stays free of server imports.

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

// Widgets that hold a full paste table, the agent setup or a chart span both columns on desktop;
// lists take one.
export const WIDE_WIDGETS: ReadonlySet<WidgetId> = new Set([
  "agents",
  "agent_activity",
  "agent_pastes",
  "recent_pastes",
  "starred",
])

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
