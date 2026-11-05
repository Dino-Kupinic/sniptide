import { DocsLayout } from "fumadocs-ui/layouts/notebook"
import { DocsFooter } from "@/components/docs-footer"
import { DocsHeader } from "@/components/docs-header"
import { baseOptions } from "@/lib/layout.shared"
import { source } from "@/lib/source"

export default async function Layout({ children, params }: LayoutProps<"/[lang]/[[...slug]]">) {
  const { lang } = await params
  const options = baseOptions(lang)
  return (
    <>
      <DocsLayout
        tree={source.getPageTree(lang)}
        {...options}
        nav={{ ...options.nav, mode: "top" }}
        slots={{ header: DocsHeader }}
        sidebar={{ collapsible: false }}
      >
        {children}
      </DocsLayout>
      <DocsFooter lang={lang} />
    </>
  )
}
