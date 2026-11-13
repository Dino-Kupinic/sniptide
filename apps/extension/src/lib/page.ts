// Functions that chrome.scripting.executeScript runs inside a web page. Chrome sends each one as
// source text, so a function here uses nothing from outside its own body: no imports, no shared
// helpers and no module constants.

export interface PageText {
  text: string
  title: string
  url: string
  hints: string[]
}

export interface PageToast {
  kind: "pending" | "success" | "error"
  message: string
  // The link to copy before the toast shows. `copied` and `saved` are the messages for a copy
  // that worked and one the page refused.
  copy?: { url: string; copied: string; saved: string }
  undo?: { label: string; pasteId: string }
  open?: { label: string; url: string }
  dismissLabel: string
}

// The reader's selection with its line breaks, plus the language names found on the code block
// around it. Returns null when nothing is selected.
export function readSelection(): PageText | null {
  const hintsAround = (start: Node | null) => {
    const hints: string[] = []
    let element = start instanceof Element ? start : (start?.parentElement ?? null)
    for (let depth = 0; element && depth < 6; depth++, element = element.parentElement) {
      const code = element.matches("pre") ? element.querySelector("code") : null
      for (const node of code ? [code, element] : [element]) {
        for (const name of ["data-language", "data-lang", "lang"]) {
          const value = node.getAttribute(name)
          if (value && node !== document.documentElement) hints.push(value)
        }
        if (typeof node.className === "string" && node.className) hints.push(node.className)
      }
      if (element.matches("pre")) break
    }
    return hints
  }
  const page = { title: document.title, url: location.href }
  const field = document.activeElement
  if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) {
    const start = field.selectionStart ?? 0
    const end = field.selectionEnd ?? 0
    if (field.type !== "password" && end > start)
      return { ...page, text: field.value.slice(start, end), hints: [] }
  }
  const selection = window.getSelection()
  const text = selection?.toString() ?? ""
  if (!selection || !text.trim()) return null
  const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null
  return { ...page, text, hints: hintsAround(range?.commonAncestorContainer ?? null) }
}

// The code blocks on the page, largest first, for a reader who opens the extension without
// selecting anything.
export function readCodeBlocks(): PageText[] {
  const seen = new Set<string>()
  const blocks: PageText[] = []
  for (const pre of document.querySelectorAll("pre")) {
    // biome-ignore lint/performance/useDomNodeTextContent: innerText keeps the line breaks of blocks built from one element per line and skips hidden line numbers
    const text = (pre.innerText || pre.textContent || "").replace(/\n+$/, "")
    if (!text.trim() || text.length > 500_000 || seen.has(text)) continue
    seen.add(text)
    const hints: string[] = []
    const code = pre.querySelector("code")
    for (const node of [code, pre, pre.parentElement, pre.parentElement?.parentElement]) {
      if (!node) continue
      for (const name of ["data-language", "data-lang", "lang"]) {
        const value = node.getAttribute(name)
        if (value && node !== document.documentElement) hints.push(value)
      }
      if (typeof node.className === "string" && node.className) hints.push(node.className)
    }
    blocks.push({ text, hints, title: document.title, url: location.href })
  }
  return blocks.sort((a, b) => b.text.length - a.text.length).slice(0, 20)
}

// Shows one toast in the page's bottom-right corner, replacing the one before it. It follows the
// app's toast: a hairline border, the float shadow, a pink check for success and a blue chip for
// Undo. The styles live in a shadow root, so the page's CSS can't reach them and they can't leak
// out. The colors repeat packages/ui/src/styles/globals.css, because a page has no access to the
// app's CSS variables.
export async function showToast(toast: PageToast) {
  const HOST = "sniptide-toast"
  document.getElementById(HOST)?.remove()

  let message = toast.message
  if (toast.copy) {
    let copied = false
    try {
      await navigator.clipboard.writeText(toast.copy.url)
      copied = true
    } catch {
      // A page that isn't focused refuses the Clipboard API; the older command still works there.
      const field = document.createElement("textarea")
      field.value = toast.copy.url
      field.style.cssText = "position:fixed;opacity:0;pointer-events:none"
      document.documentElement.append(field)
      field.select()
      try {
        copied = document.execCommand("copy")
      } catch {}
      field.remove()
    }
    message = copied ? toast.copy.copied : toast.copy.saved
  }

  const host = document.createElement("div")
  host.id = HOST
  host.style.cssText =
    "all:initial;position:fixed;right:24px;bottom:24px;z-index:2147483647;width:320px;max-width:calc(100vw - 32px)"
  const root = host.attachShadow({ mode: "closed" })
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches
  const style = document.createElement("style")
  style.textContent = `
    :host { ${
      dark
        ? "--popover:#1a1919;--foreground:#f4f4f4;--muted:#242222;--muted-foreground:#a3a3a3;--border:#2f2c2c;--highlight:#f6a9d3;--destructive:oklch(0.704 0.191 22.216);--ring:#8f8cff;--shadow:0 1px 2px rgb(0 0 0 / 0.4),0 8px 24px -6px rgb(0 0 0 / 0.6);"
        : "--popover:#ffffff;--foreground:#1b1919;--muted:#f4f4f4;--muted-foreground:#6b6b6b;--border:#e8e8e8;--highlight:#e353ac;--destructive:oklch(0.577 0.245 27.325);--ring:#2a26ec;--shadow:0 1px 2px rgb(27 25 25 / 0.06),0 8px 24px -6px rgb(27 25 25 / 0.14);"
    } --primary:#2a26ec; --primary-foreground:#ffffff; }
    .toast { box-sizing: border-box; display: flex; align-items: center; gap: 12px; min-height: 48px;
      padding: 10px 10px 10px 16px; border: 1px solid var(--border); border-radius: 6px;
      background: var(--popover); color: var(--foreground); box-shadow: var(--shadow);
      font: 400 13px/18px Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      animation: in 200ms ease-out; }
    .toast[data-kind="error"] { border-color: color-mix(in oklab, var(--destructive) 40%, transparent); }
    .message { flex: 1; min-width: 0; overflow-wrap: anywhere; }
    svg { flex: none; width: 16px; height: 16px; }
    .check { color: var(--highlight); }
    .alert { color: var(--destructive); }
    .spinner { color: var(--muted-foreground); animation: spin 1s linear infinite; }
    button, a { flex: none; height: 24px; border: 0; border-radius: 4.8px; font: inherit;
      cursor: pointer; outline: none; text-decoration: none; display: inline-flex;
      align-items: center; justify-content: center; box-sizing: border-box; }
    button:focus-visible, a:focus-visible { box-shadow: 0 0 0 2px color-mix(in oklab, var(--ring) 40%, transparent); }
    .action { padding: 0 8px; background: var(--primary); color: var(--primary-foreground); font-weight: 500; }
    .action:hover { background: color-mix(in oklab, var(--primary) 85%, transparent); }
    .action:active { transform: translateY(1px); }
    .open { padding: 0 8px; background: transparent; color: var(--foreground); font-weight: 500; }
    .open:hover { background: var(--muted); }
    .dismiss { width: 24px; padding: 0; background: transparent; color: var(--muted-foreground); }
    .dismiss:hover { background: var(--muted); color: var(--foreground); }
    .dismiss svg { width: 14px; height: 14px; }
    @keyframes in { from { opacity: 0; transform: translateY(8px); } }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .toast, .spinner { animation: none; } }
  `
  const icons = {
    success:
      '<svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" aria-hidden="true"><path d="M4.5 12.5 9.5 17.5 19.5 6.5"/></svg>',
    error:
      '<svg class="alert" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>',
    pending:
      '<svg class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" opacity="0.25"/><path d="M21 12a9 9 0 0 0-9-9"/></svg>',
  }
  const box = document.createElement("div")
  box.className = "toast"
  box.dataset.kind = toast.kind
  box.setAttribute("role", toast.kind === "error" ? "alert" : "status")
  // The icons are fixed markup from this function; every string from outside goes in as text.
  box.innerHTML = icons[toast.kind]
  const text = document.createElement("span")
  text.className = "message"
  text.textContent = message
  box.append(text)

  const close = () => host.remove()
  if (toast.open) {
    const link = document.createElement("a")
    link.className = "open"
    link.href = toast.open.url
    link.target = "_blank"
    link.rel = "noreferrer"
    link.textContent = toast.open.label
    box.append(link)
  }
  if (toast.undo) {
    const { pasteId, label } = toast.undo
    const button = document.createElement("button")
    button.type = "button"
    button.className = "action"
    button.textContent = label
    button.addEventListener("click", () => {
      close()
      void chrome.runtime.sendMessage({ type: "undo", pasteId })
    })
    box.append(button)
  }
  const dismiss = document.createElement("button")
  dismiss.type = "button"
  dismiss.className = "dismiss"
  dismiss.setAttribute("aria-label", toast.dismissLabel)
  dismiss.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>'
  dismiss.addEventListener("click", close)
  box.append(dismiss)

  root.append(style, box)
  document.documentElement.append(host)
  if (toast.kind !== "pending") {
    const duration = toast.kind === "error" ? 6000 : toast.undo ? 8000 : 3000
    setTimeout(() => {
      if (host.isConnected) close()
    }, duration)
  }
}
