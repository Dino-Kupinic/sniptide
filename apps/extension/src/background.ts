import { SniptideError } from "@sniptide/sdk"
import { instanceOrigin, OAuthError } from "@workspace/oauth-client"
import { captureFromSelection, type PageSelection } from "./lib/capture"
import { messages } from "./lib/messages"
import { type PageToast, readSelection, showToast } from "./lib/page"
import {
  DEFAULT_SETTINGS,
  type Replies,
  type Reply,
  type Request,
  type Settings,
  type State,
} from "./lib/protocol"
import { createSessions, type Session, SignedOutError } from "./lib/session"

// The extension's service worker. It owns the tokens and every request to Sniptide, saves the
// selection from the context menu and the keyboard shortcut, and answers the popup.

const MENU_ID = "save-selection"
const COMMAND = "save-selection"
// Tide Blue and white from packages/ui/src/styles/globals.css. The badge API takes no CSS
// variables, and the mark itself tells success from failure.
const BADGE = { fill: "#2A26EC", text: "#FFFFFF" }

const sessions = createSessions({
  storage: {
    async get() {
      const { session } = await chrome.storage.local.get("session")
      return (session as Session | undefined) ?? null
    },
    async set(session) {
      if (session) await chrome.storage.local.set({ session })
      else await chrome.storage.local.remove("session")
    },
  },
  fetch: ((input, init) => fetch(input, init)) as typeof fetch,
  redirectUri: chrome.identity.getRedirectURL("oauth"),
  async authorize(url) {
    let callback: string | undefined
    try {
      callback = await chrome.identity.launchWebAuthFlow({ url, interactive: true })
    } catch {}
    // Chrome rejects without a usable reason when the reader closes the window.
    if (!callback) throw new OAuthError(messages.signInCancelled, "cancelled")
    return callback
  },
})

async function readSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.local.get("settings")
  return { ...DEFAULT_SETTINGS, ...(settings as Partial<Settings> | undefined) }
}

async function readState(): Promise<State> {
  return { settings: await readSettings(), account: await sessions.account() }
}

function errorReply(error: unknown): Reply<never> {
  if (error instanceof SignedOutError)
    return { ok: false, error: error.message, code: "signed_out" }
  if (error instanceof OAuthError) return { ok: false, error: error.message, code: error.code }
  if (error instanceof SniptideError) {
    const message =
      error.code === "network_error"
        ? messages.unreachable
        : error.status === 403
          ? messages.readOnly
          : error.message
    return { ok: false, error: message, code: error.code ?? "error" }
  }
  return { ok: false, error: messages.unexpected, code: "error" }
}

async function createPaste(request: Extract<Request, { type: "create" }>) {
  const { paste } = await sessions.run((client) => client.createPaste(request.input, request.key))
  if (request.expiry === "never") return { paste, warning: null }
  try {
    // The expiry is a sharing setting, which the API takes after the paste exists.
    await sessions.run((client) => client.updateSettings(paste.id, { expiry: request.expiry }))
    return { paste, warning: null }
  } catch {
    return { paste, warning: messages.expiryNotSet }
  }
}

async function handle(request: Request): Promise<Replies[Request["type"]]> {
  switch (request.type) {
    case "state":
      return readState()
    case "signIn": {
      await sessions.signIn(instanceOrigin(request.instance))
      return readState()
    }
    case "signOut":
      await sessions.signOut()
      return readState()
    case "settings": {
      await chrome.storage.local.set({
        settings: { ...(await readSettings()), ...request.settings },
      })
      return readState()
    }
    case "create":
      return createPaste(request)
    case "recent": {
      const query = request.query.trim()
      const page = await sessions.run((client) =>
        client.listPastes({ limit: 20, ...(query ? { q: query } : {}) }),
      )
      return page.pastes
    }
    case "collections":
      return (await sessions.run((client) => client.listCollections())).collections
    case "undo":
      await sessions.run((client) => client.trashPaste(request.pasteId))
      return null
  }
}

chrome.runtime.onMessage.addListener((request: Request, sender, respond) => {
  // A toast in a web page may only take back the paste it announced. Everything else must come
  // from one of the extension's own pages.
  const ownPage = sender.url?.startsWith(chrome.runtime.getURL("")) ?? false
  if (sender.id !== chrome.runtime.id || (!ownPage && request.type !== "undo")) return false
  handle(request)
    .then(async (value) => {
      if (request.type === "undo" && sender.tab?.id !== undefined)
        await toast(sender.tab.id, { kind: "success", message: messages.movedToTrash })
      respond({ ok: true, value })
    })
    .catch(async (error: unknown) => {
      const reply = errorReply(error)
      if (request.type === "undo" && sender.tab?.id !== undefined && !reply.ok)
        await toast(sender.tab.id, { kind: "error", message: reply.error })
      respond(reply)
    })
  return true
})

// Shows a toast in the tab, or marks the toolbar button on a page Chrome keeps extensions out of.
async function toast(tabId: number, content: Omit<PageToast, "dismissLabel">) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: showToast,
      args: [{ ...content, dismissLabel: messages.dismiss }],
    })
  } catch {
    if (content.kind === "pending") return
    await chrome.action.setBadgeBackgroundColor({ color: BADGE.fill })
    await chrome.action.setBadgeTextColor({ color: BADGE.text })
    await chrome.action.setBadgeText({ tabId, text: content.kind === "error" ? "!" : "✓" })
    setTimeout(() => void chrome.action.setBadgeText({ tabId, text: "" }), 4000)
  }
}

async function selectionIn(
  tab: chrome.tabs.Tab,
  frameId: number | undefined,
  fallbackText: string | undefined,
): Promise<PageSelection | null> {
  if (tab.id !== undefined) {
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id, ...(frameId ? { frameIds: [frameId] } : {}) },
        func: readSelection,
      })
      if (result?.result) return result.result
    } catch {}
  }
  // Chrome's own copy of the selection has no line breaks, so it's the fallback for pages and
  // frames a script can't read.
  if (!fallbackText?.trim()) return null
  return { text: fallbackText, title: tab.title ?? "", url: tab.url ?? "", hints: [] }
}

// Saves the tab's selection with the reader's defaults, copies the link and says so in the page.
async function quickSave(tab: chrome.tabs.Tab, frameId?: number, fallbackText?: string) {
  if (tab.id === undefined) return
  const tabId = tab.id
  if (!(await sessions.account())) {
    try {
      await chrome.action.openPopup()
    } catch {
      await toast(tabId, { kind: "error", message: messages.signInFirst })
    }
    return
  }
  const selection = await selectionIn(tab, frameId, fallbackText)
  if (!selection) {
    await toast(tabId, { kind: "error", message: messages.nothingSelected })
    return
  }
  await toast(tabId, { kind: "pending", message: messages.saving })
  try {
    const settings = await readSettings()
    const { paste } = await sessions.run((client) =>
      client.createPaste(captureFromSelection(selection, settings), crypto.randomUUID()),
    )
    await toast(tabId, {
      kind: "success",
      message: messages.saved,
      copy: { url: paste.url, copied: messages.linkCopied, saved: messages.saved },
      open: { label: messages.open, url: paste.url },
      undo: { label: messages.undo, pasteId: paste.id },
    })
  } catch (error) {
    const reply = errorReply(error)
    await toast(tabId, { kind: "error", message: reply.ok ? messages.unexpected : reply.error })
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: messages.menuSaveSelection,
    contexts: ["selection"],
  })
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID && tab) void quickSave(tab, info.frameId, info.selectionText)
})

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === COMMAND && tab) void quickSave(tab)
})
