import "server-only"

import { z } from "zod"
import { getConfig } from "@/lib/config"
import {
  isTemplateCategory,
  isTemplateDepartment,
  type TemplateCategory,
  type TemplateDepartment,
} from "@/lib/template-filter"

// Templates are pages on the marketing site (sniptide.com/templates/<name>), whose files are also
// served as JSON at /templates/<name>.json. `/new?template=<name>` reads that JSON and opens the
// editor with its files, so the person saves an ordinary paste of their own. TEMPLATES_URL turns
// this on; without it the parameter is ignored and the editor opens empty.

export type TemplateDraft = {
  title: string
  description: string
  files: { name: string; content: string }[]
}

// Template names are the page's slug. Anything else never reaches the network.
const templateName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// The same limits as a paste (lib/pastes/schema.ts), so the draft can be saved as it is.
const templateJson = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(280).default(""),
  files: z
    .array(z.object({ name: z.string().trim().min(1).max(120), content: z.string() }))
    .min(1)
    .max(10),
})

export function templateJsonUrl(base: string, name: string): string | null {
  if (!templateName.test(name)) return null
  return `${base.replace(/\/+$/, "")}/${name}.json`
}

export function parseTemplate(value: unknown): TemplateDraft | null {
  const result = templateJson.safeParse(value)
  if (!result.success) return null
  const { title, description, files } = result.data
  return { title, description, files: files.map(({ name, content }) => ({ name, content })) }
}

// The template's files, or null for an unknown name, a site that doesn't answer in time or a body
// that isn't a template. Responses are cached for an hour, as long as the site caches them.
export async function templateDraft(name: string): Promise<TemplateDraft | null> {
  const base = getConfig().templatesUrl
  const url = base ? templateJsonUrl(base, name) : null
  if (!url) return null
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 3600 },
    })
    if (!response.ok) return null
    return parseTemplate(await response.json())
  } catch {
    return null
  }
}

// One template in the dashboard's list, from the site's /templates.json. The visual's artwork is
// an absolute URL by the time it reaches the page: a logo drawn as a mask in the text color, or an
// icon with a short name beside it.
export type TemplateVisual =
  | { kind: "logo"; src: string; ratio: number }
  | { kind: "icon"; src: string; mark: string }

export type TemplateSummary = {
  name: string
  title: string
  description: string
  // The website's category and department keys (lib/template-filter.ts), or null for one this
  // version doesn't know yet.
  category: TemplateCategory | null
  department: TemplateDepartment | null
  files: string[]
  visual: TemplateVisual | null
  // The first lines of the main file as plain text, which the card's cover shows blurred behind
  // the visual.
  preview: string | null
}

// The whole directory for the catalog page, with room to grow. The widget shows the first few.
const CATALOG_LIMIT = 100
// Lines the cover shows before it runs off the bottom edge, like the website's cards.
const PREVIEW_LINES = 10

const catalogEntry = z.object({
  name: z.string().regex(templateName),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(280).default(""),
  category: z
    .unknown()
    .optional()
    .transform((value) => (isTemplateCategory(value) ? value : null)),
  department: z
    .unknown()
    .optional()
    .transform((value) => (isTemplateDepartment(value) ? value : null)),
  files: z.array(z.string().trim().min(1).max(120)).min(1).max(10),
  visual: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("logo"), src: z.string().min(1), ratio: z.number().positive() }),
      z.object({
        kind: z.literal("icon"),
        src: z.string().min(1),
        mark: z.string().min(1).max(16),
      }),
    ])
    .nullable()
    .catch(null),
  preview: z
    .string()
    .transform((value) => value.split("\n").slice(0, PREVIEW_LINES).join("\n").slice(0, 2000))
    .nullish()
    .catch(null)
    .transform((value) => value ?? null),
})

// The list sits next to the template pages: https://sniptide.com/templates becomes
// https://sniptide.com/templates.json.
export function templateCatalogUrl(base: string): string {
  return `${base.replace(/\/+$/, "")}.json`
}

// Entries in the site's order. An entry that doesn't parse is skipped rather than failing the
// list, and artwork paths resolve against the list's URL. Artwork that isn't https, or http on a
// local development host, is dropped so the page never loads it.
export function parseTemplateCatalog(value: unknown, url: string): TemplateSummary[] {
  const entries =
    value && typeof value === "object" && "templates" in value && Array.isArray(value.templates)
      ? value.templates
      : []
  const summaries: TemplateSummary[] = []
  for (const entry of entries) {
    const result = catalogEntry.safeParse(entry)
    if (!result.success) continue
    const { visual, ...template } = result.data
    summaries.push({ ...template, visual: visual && resolveArtwork(visual, url) })
    if (summaries.length === CATALOG_LIMIT) break
  }
  return summaries
}

function resolveArtwork(visual: TemplateVisual, base: string): TemplateVisual | null {
  try {
    const src = new URL(visual.src, base)
    const local = src.hostname === "localhost" || src.hostname === "127.0.0.1"
    if (src.protocol !== "https:" && !(local && src.protocol === "http:")) return null
    return { ...visual, src: src.href }
  } catch {
    return null
  }
}

// The templates for the dashboard, or an empty list when the site doesn't answer in time or sends
// something else, including when TEMPLATES_URL is unset.
export async function templateCatalog(): Promise<TemplateSummary[]> {
  const base = getConfig().templatesUrl
  if (!base) return []
  const url = templateCatalogUrl(base)
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 3600 },
    })
    if (!response.ok) return []
    return parseTemplateCatalog(await response.json(), url)
  } catch {
    return []
  }
}
