// The Sniptide palette for email, from packages/ui/src/styles/globals.css. Email clients can't read
// CSS variables, so the values are repeated here; change a token in globals.css first.
export const light = {
  canvas: "#fafafa",
  surface: "#ffffff",
  border: "#e8e8e8",
  foreground: "#1b1919",
  muted: "#6b6b6b",
  link: "#2a26ec",
  primary: "#2a26ec",
  primaryForeground: "#ffffff",
  // The raised button edge: --primary mixed with 38% black in OKLCH, as in the Button component.
  depth: "#110f7c",
  logo: "#2a26ec",
}

export const dark = {
  canvas: "#0c0b0b",
  surface: "#121111",
  border: "#2f2c2c",
  foreground: "#f4f4f4",
  muted: "#a3a3a3",
  link: "#8f8cff",
  logo: "#ffffff",
}

export const fonts = {
  sans: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  heading:
    'Archivo, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  mono: '"Paper Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
}

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
  .st-logo { background-color: ${dark.logo} !important; }
}
`
