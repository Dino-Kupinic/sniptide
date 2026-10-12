"use client"

import { ApiReferenceReact } from "@scalar/api-reference-react"
import "@scalar/api-reference-react/style.css"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

// Scalar's own styles, retuned to Sniptide's tokens so the reference follows the app's theme.
// Square corners, the app's fonts and its blue.
const customCss = `
.scalar-app, .light-mode, .dark-mode {
  --scalar-font: var(--font-sans), ui-sans-serif, system-ui, sans-serif;
  --scalar-font-code: var(--font-mono), ui-monospace, monospace;
  --scalar-radius: 0px;
  --scalar-radius-lg: 0px;
  --scalar-radius-xl: 0px;
}
.light-mode {
  --scalar-background-1: #ffffff;
  --scalar-background-2: #f4f4f4;
  --scalar-background-3: #e8e8e8;
  --scalar-background-accent: #2a26ec14;
  --scalar-color-1: #1b1919;
  --scalar-color-2: #6b6b6b;
  --scalar-color-3: #8a8a8a;
  --scalar-color-accent: #2a26ec;
  --scalar-border-color: #e8e8e8;
  --scalar-button-1: #1b1919;
  --scalar-button-1-color: #ffffff;
  --scalar-button-1-hover: #3a3737;
}
.dark-mode {
  --scalar-background-1: #121111;
  --scalar-background-2: #1a1919;
  --scalar-background-3: #242222;
  --scalar-background-accent: #3a36ff29;
  --scalar-color-1: #f4f4f4;
  --scalar-color-2: #a3a3a3;
  --scalar-color-3: #7a7a7a;
  --scalar-color-accent: #8c89ff;
  --scalar-border-color: #2f2c2c;
  --scalar-button-1: #f4f4f4;
  --scalar-button-1-color: #121111;
  --scalar-button-1-hover: #d4d4d4;
}
`

// The OpenAPI document is fetched from this app, which the page's content security policy allows.
// Telemetry and the hosted request proxy are off: this page makes no request to anyone else, and
// "Test request" calls the server it was opened on.
export function ApiReference() {
  const { resolvedTheme } = useTheme()
  // The theme is unknown until the client mounts; rendering Scalar before that would flash the
  // wrong colors.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  return (
    <ApiReferenceReact
      configuration={{
        url: "/api/openapi.json",
        // Examples and "Test request" point at the server the page was opened on, which is also
        // the only origin the page's content security policy lets it call.
        servers: [{ url: window.location.origin, description: "This server" }],
        theme: "none",
        customCss,
        withDefaultFonts: false,
        forceDarkModeState: resolvedTheme === "dark" ? "dark" : "light",
        hideDarkModeToggle: true,
        telemetry: false,
        // Scalar's editor toolbar and its hosted AI and MCP features are for people who write the
        // spec, not for readers of the reference.
        showDeveloperTools: "never",
        agent: { disabled: true },
        mcp: { disabled: true },
        defaultHttpClient: { targetKey: "shell", clientKey: "curl" },
      }}
    />
  )
}
