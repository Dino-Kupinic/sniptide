import "server-only"

import { github } from "./github"
import type { IntegrationProvider } from "./types"

// Every service a user can connect. Adding one is an adapter file and a line here; see
// "Add an integration" in docs/development.md.
export const providers: readonly IntegrationProvider[] = [github]

export function getProvider(id: string) {
  return providers.find((provider) => provider.id === id) ?? null
}
