import { createFromSource } from "fumadocs-core/search/server"
import { source } from "@/lib/source"

// Orama search over the page content, built in memory from the same source as the sidebar.
export const { GET } = createFromSource(source)
