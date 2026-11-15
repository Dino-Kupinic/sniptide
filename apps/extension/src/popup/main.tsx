import { createRoot } from "react-dom/client"
import { App } from "./app"

// The popup follows the system theme, like the app does by default.
const dark = window.matchMedia("(prefers-color-scheme: dark)")
const applyTheme = () => document.documentElement.classList.toggle("dark", dark.matches)
applyTheme()
dark.addEventListener("change", applyTheme)

const root = document.getElementById("root")
if (root) createRoot(root).render(<App />)
