"use client"

import { createContext, useContext } from "react"
import { DEFAULT_RESOURCE_LINKS, type ResourceLinks } from "@/lib/resource-links"

// The account menu is a client component and the configured URLs are read on the server, so the
// app layout hands them down here instead of the menu hard-coding any address.
const ResourceLinksContext = createContext<ResourceLinks>(DEFAULT_RESOURCE_LINKS)

export function ResourceLinksProvider({
  links,
  children,
}: {
  links: ResourceLinks
  children: React.ReactNode
}) {
  return <ResourceLinksContext value={links}>{children}</ResourceLinksContext>
}

export function useResourceLinks() {
  return useContext(ResourceLinksContext)
}
