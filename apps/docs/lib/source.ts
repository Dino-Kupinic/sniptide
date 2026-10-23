import { loader } from "fumadocs-core/source"
import { lucideIconsPlugin } from "fumadocs-core/source/lucide-icons"
import { metaSchema, pageSchema } from "fumadocs-core/source/schema"
import { applyMdxPreset } from "fumadocs-mdx/config"
import { defineDocs } from "fumadocs-mdx/macro"
import { codeTheme } from "./code-theme"
import { docsRoute } from "./site"

const docs = defineDocs({
  dir: "content/docs",
  docs: {
    schema: pageSchema,
    // Fumadocs' defaults with the app's code colours in place of GitHub's themes.
    mdxOptions: applyMdxPreset({
      rehypeCodeOptions: { themes: { light: codeTheme, dark: codeTheme } },
    }),
  },
  meta: { schema: metaSchema },
})

// See https://fumadocs.dev/docs/headless/source-api
export const source = loader({
  baseUrl: docsRoute,
  source: docs.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
})
