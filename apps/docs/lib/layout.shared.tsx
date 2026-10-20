import { Logo } from "@sniptide/ui/components/logo"
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared"
import { appUrl, gitHubUrl } from "./site"

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <Logo />,
      url: "/",
    },
    githubUrl: gitHubUrl,
    links: [
      { text: "API reference", url: `${appUrl()}/docs/api`, external: true },
      { text: "Open Sniptide", url: appUrl(), external: true },
    ],
  }
}
