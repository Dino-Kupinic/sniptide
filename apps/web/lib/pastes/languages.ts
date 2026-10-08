// Languages Sniptide recognises, with the square marker the Paper designs use for each one.
// Filled/outlined and primary/ink combinations keep lists scannable without syntax colours.

export type Marker =
  | "filled-primary"
  | "filled-foreground"
  | "outline-primary"
  | "outline-foreground"
  | "muted"

export interface Language {
  id: string
  name: string
  marker: Marker
  extensions: string[]
  filenames?: string[]
}

export const languages: Language[] = [
  {
    id: "typescript",
    name: "TypeScript",
    marker: "filled-primary",
    extensions: ["ts", "tsx", "mts", "cts"],
  },
  {
    id: "javascript",
    name: "JavaScript",
    marker: "filled-primary",
    extensions: ["js", "jsx", "mjs", "cjs"],
  },
  { id: "sql", name: "SQL", marker: "filled-primary", extensions: ["sql"] },
  {
    id: "shell",
    name: "Shell",
    marker: "outline-foreground",
    extensions: ["sh", "bash", "zsh"],
    filenames: [".zshrc", ".bashrc", ".profile", "crontab"],
  },
  { id: "python", name: "Python", marker: "outline-foreground", extensions: ["py"] },
  {
    id: "nginx",
    name: "Nginx",
    marker: "filled-foreground",
    extensions: ["nginx"],
    filenames: ["nginx.conf"],
  },
  {
    id: "docker",
    name: "Docker",
    marker: "filled-foreground",
    extensions: ["dockerfile"],
    filenames: ["Dockerfile", "docker-compose.yml", "compose.yaml", "compose.yml"],
  },
  { id: "yaml", name: "YAML", marker: "outline-primary", extensions: ["yaml", "yml"] },
  { id: "go", name: "Go", marker: "outline-primary", extensions: ["go"] },
  { id: "hcl", name: "HCL", marker: "outline-primary", extensions: ["tf", "hcl"] },
  { id: "json", name: "JSON", marker: "outline-primary", extensions: ["json"] },
  { id: "markdown", name: "Markdown", marker: "muted", extensions: ["md", "mdx"] },
  { id: "text", name: "Plain text", marker: "muted", extensions: ["txt", "log"] },
]

const byId = new Map(languages.map((language) => [language.id, language]))
const plainText = byId.get("text") as Language

export function getLanguage(id: string): Language {
  return byId.get(id) ?? plainText
}

// Picks a language from a file name: exact names first (crontab, Dockerfile), then the extension.
export function detectLanguage(filename: string): Language {
  const name = filename.trim()
  const exact = languages.find((language) => language.filenames?.includes(name))
  if (exact) return exact

  const extension = name.includes(".") ? name.split(".").pop()?.toLowerCase() : name.toLowerCase()
  return (
    languages.find((language) => extension && language.extensions.includes(extension)) ?? plainText
  )
}

export const markerClass: Record<Marker, string> = {
  "filled-primary": "bg-primary",
  "filled-foreground": "bg-foreground",
  "outline-primary": "border-[1.5px] border-primary",
  "outline-foreground": "border-[1.5px] border-foreground",
  muted: "bg-muted-foreground/40",
}
