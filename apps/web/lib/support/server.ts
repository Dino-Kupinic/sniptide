import "server-only"

import { getConfig } from "@/lib/config"
import { type InstanceType, isHostedInstance, type SupportSettings } from "./report"

// The release this server runs, embedded at build time (next.config.ts) because the runtime image
// has no build environment.
export function deploymentVersion() {
  return process.env.DEPLOYMENT_VERSION || "development"
}

export function instanceType(): InstanceType {
  return isHostedInstance(getConfig().appUrl) ? "hosted" : "self-hosted"
}

export function supportSettings(userId: string): SupportSettings {
  const { support } = getConfig()
  return {
    reports: support.linear ? "linear" : "link",
    assistant: Boolean(support.assistant),
    version: deploymentVersion(),
    instance: instanceType(),
    userId,
  }
}

export const noStore = { "cache-control": "private, no-store" }
