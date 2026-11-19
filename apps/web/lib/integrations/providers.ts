import "server-only"

import { github } from "./github"
import { linear } from "./linear"
import { notion } from "./notion"
import { slack } from "./slack"
import type { IntegrationProvider } from "./types"

// Every service a user can connect. Adding one is an adapter file and a line here; see
// "Add an integration" in docs/development.md.
export const providers: readonly IntegrationProvider[] = [github, slack, linear, notion]

export function getProvider(id: string) {
  return providers.find((provider) => provider.id === id) ?? null
}
