import "server-only"

import { z } from "zod"
import { getConfig } from "@/lib/config"

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
