import "server-only"

import { type Config, getConfig } from "@/lib/config"

type CloudFeature = "discovery" | "gallery" | "shortLinks"

export function isCloud(config: Pick<Config, "edition"> = getConfig()): boolean {
  return config.edition === "cloud"
}

export function hasFeature(
  feature: CloudFeature,
  config: Pick<Config, "edition"> = getConfig(),
): boolean {
  switch (feature) {
    case "discovery":
    case "gallery":
    case "shortLinks":
      return isCloud(config)
  }
}
