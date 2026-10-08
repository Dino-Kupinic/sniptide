// Placeholder data for building the UI before the paste tables exist. Shapes mirror what the
// app will read from D1, so screens can switch to real queries without changing their props.

export type Visibility = "public" | "unlisted" | "private"

export interface ViewerSummary {
  name: string
  email: string
  username: string | null
  initials: string
  storageUsedMb: number
  storageLimitMb: number
}

export interface NavCounts {
  pastes: number
  starred: number
  shared: number
}

export interface Collection {
  slug: string
  name: string
  marker: "filled-primary" | "filled-foreground" | "outline-primary" | "outline-foreground"
}

export const viewerStorage: Pick<ViewerSummary, "storageUsedMb" | "storageLimitMb"> = {
  storageUsedMb: 38.2,
  storageLimitMb: 100,
}

export const collections: Collection[] = [
  { slug: "api-snippets", name: "api-snippets", marker: "filled-primary" },
  { slug: "dotfiles", name: "dotfiles", marker: "filled-foreground" },
  { slug: "k8s-manifests", name: "k8s-manifests", marker: "outline-primary" },
  { slug: "interview-prep", name: "interview-prep", marker: "outline-foreground" },
]
