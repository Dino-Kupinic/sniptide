import { Step, Steps } from "fumadocs-ui/components/steps"
import { Tab, Tabs } from "fumadocs-ui/components/tabs"
import defaultMdxComponents from "fumadocs-ui/mdx"
import type { MDXComponents } from "mdx/types"
import { BurnAfterReadVisual, FirstPasteVisual, HowItFitsVisual } from "@/components/visuals"

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    BurnAfterReadVisual,
    FirstPasteVisual,
    HowItFitsVisual,
    Step,
    Steps,
    Tab,
    Tabs,
    ...components,
  } satisfies MDXComponents
}

export const useMDXComponents = getMDXComponents

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>
}
