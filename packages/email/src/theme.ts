// The Sniptide palette for email, from packages/ui/src/styles/globals.css. Email clients can't read
// CSS variables, so the values are repeated here; change a token in globals.css first.
export const light = {
  canvas: "#fafafa",
  surface: "#ffffff",
  border: "#e8e8e8",
  fill: "#f4f4f4",
  foreground: "#1b1919",
  muted: "#6b6b6b",
  link: "#2a26ec",
  primary: "#2a26ec",
  primaryForeground: "#ffffff",
  // The raised button edge: --primary mixed with 38% black in OKLCH, as in the Button component.
  depth: "#110f7c",
}

const dark = {
  canvas: "#0c0b0b",
  surface: "#121111",
  border: "#2f2c2c",
  foreground: "#f4f4f4",
  muted: "#a3a3a3",
  link: "#8f8cff",
}

export const fonts = {
  sans: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  heading:
    'Archivo, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  mono: '"Paper Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
}

// The brand fonts, served by the instance from public/email/fonts (Latin subsets, SIL Open Font
// License). Apple Mail, iOS Mail and Outlook for Mac load them; Gmail and Outlook on Windows keep
// the system fonts later in each stack.
export function fontFaceCss(base: string) {
  const face = (family: string, weight: number, file: string) =>
    `@font-face { font-family: ${family}; font-style: normal; font-weight: ${weight}; font-display: swap; src: url(${new URL(file, base).href}) format("woff2"); }`
  return [
    face("Inter", 400, "inter-400.woff2"),
    face("Inter", 600, "inter-600.woff2"),
    face("Archivo", 700, "archivo-700.woff2"),
  ].join("\n")
}

// Below 600px the card gives way to the full width of the screen with the app's 16px gutter, like
// a phone's own mail view, so the text keeps its width instead of sitting inside two margins.
export const phoneCss = `
@media (max-width: 600px) {
  .st-outer { padding: 0 !important; }
  .st-surface { border: 0 !important; border-radius: 0 !important; }
  .st-pad { padding-left: 16px !important; padding-right: 16px !important; }
  .st-stack { display: block !important; width: 100% !important; }
}
`

// Clients that support prefers-color-scheme (Apple Mail, Outlook for Mac and iOS, Thunderbird)
// switch to the dark palette through these classes. Gmail and Outlook on the web apply their own
// dark mode to the light palette instead.
export const darkModeCss = `
:root { color-scheme: light dark; supported-color-schemes: light dark; }
@media (prefers-color-scheme: dark) {
  .st-canvas { background-color: ${dark.canvas} !important; }
  .st-surface { background-color: ${dark.surface} !important; border-color: ${dark.border} !important; }
  .st-text { color: ${dark.foreground} !important; }
  .st-muted { color: ${dark.muted} !important; }
  .st-link { color: ${dark.link} !important; }
  .st-rule { border-color: ${dark.border} !important; }
  .st-md p, .st-md li, .st-md h1, .st-md h2, .st-md h3, .st-md strong { color: ${dark.foreground} !important; }
  .st-md a { color: ${dark.link} !important; }
  .st-md code, .st-md pre { background-color: ${dark.border} !important; color: ${dark.foreground} !important; }
  .st-logo-light { display: none !important; }
  .st-logo-dark { display: block !important; max-height: none !important; }
}
`
