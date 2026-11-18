// The templates directory's departments and categories, in the order the website lists them, and
// the search the in-app catalog runs. Free of server imports, so the catalog filters in the
// browser. Values the website adds later still list under All, without a label.

export const TEMPLATE_DEPARTMENTS = ["engineering", "product", "marketing"] as const
export const TEMPLATE_CATEGORIES = [
  "agents",
  "deploy",
  "project",
  "specs",
  "discovery",
  "writing",
] as const

export type TemplateDepartment = (typeof TEMPLATE_DEPARTMENTS)[number]
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]

export function isTemplateDepartment(value: unknown): value is TemplateDepartment {
  return TEMPLATE_DEPARTMENTS.some((department) => department === value)
}

export function isTemplateCategory(value: unknown): value is TemplateCategory {
  return TEMPLATE_CATEGORIES.some((category) => category === value)
}

// Whether a template matches every word of a search, in its title, description, file names or the
// labels the reader sees for its category and department.
export function matchesTemplateQuery(
  template: { title: string; description: string; files: readonly string[] },
  labels: readonly string[],
  query: string,
): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = [template.title, template.description, ...labels, ...template.files]
    .join(" ")
    .toLowerCase()
  return words.every((word) => haystack.includes(word))
}
