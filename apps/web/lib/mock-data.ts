// Placeholder data for building the UI before the paste tables exist. Shapes mirror what the
// app will read from the database, so screens can switch to real queries without changing their props.

export type Visibility = "public" | "unlisted" | "private"

export interface ViewerSummary {
  name: string
  email: string
  username: string | null
  image: string | null
  initials: string
  storageUsedMb: number
  storageLimitMb: number
}

export interface NavCounts {
  pastes: number
  starred: number
  shared: number
}

export const viewerStorage: Pick<ViewerSummary, "storageUsedMb" | "storageLimitMb"> = {
  storageUsedMb: 38.2,
  storageLimitMb: 100,
}
