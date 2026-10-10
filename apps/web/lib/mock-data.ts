// Placeholder data for building the UI before the paste tables exist. Shapes mirror what the
// app will read from the database, so screens can switch to real queries without changing their props.

import type { ViewerSummary } from "@/lib/viewer"

export const viewerStorage: Pick<ViewerSummary, "storageUsedMb" | "storageLimitMb"> = {
  storageUsedMb: 38.2,
  storageLimitMb: 100,
}
