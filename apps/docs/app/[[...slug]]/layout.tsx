import { DocsLayout } from "fumadocs-ui/layouts/notebook"
import { DocsFooter } from "@/components/docs-footer"
import { DocsHeader } from "@/components/docs-header"
import { baseOptions } from "@/lib/layout.shared"
import { source } from "@/lib/source"

export default function Layout({ children }: LayoutProps<"/[[...slug]]">) {
  const options = baseOptions()
  return (
    <>
      <DocsLayout
        tree={source.getPageTree()}
        {...options}
        nav={{ ...options.nav, mode: "top" }}
        slots={{ header: DocsHeader }}
        sidebar={{ collapsible: false }}
      >
        {children}
      </DocsLayout>
      <DocsFooter />
    </>
  )
}
