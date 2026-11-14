import type { Collection, Paste, PasteSummary } from "@sniptide/sdk"
import * as vscode from "vscode"
import type { Auth } from "./auth"
import { describe } from "./errors"
import { messages } from "./lib/messages"
import { SignedOutError } from "./lib/session"

// The Snippets view: the most recently changed snippets and every collection, or the results of
// a search. Lists load a page at a time and stay cached until the view refreshes.

export const VIEW_ID = "sniptide.snippets"
export const CONTENT_SCHEME = "sniptide"
const PAGE_SIZE = 30

type Listed = PasteSummary | Paste

export type SnippetNode = { kind: "snippet"; paste: Listed; list: string }
type GroupNode = { kind: "recent" } | { kind: "collection"; collection: Collection }
type MoreNode = { kind: "more"; list: string }
export type Node = SnippetNode | GroupNode | MoreNode

interface List {
  pastes: Listed[]
  nextCursor: string | null
}

const RECENT = "recent"
const SEARCH = "search"
const collectionList = (slug: string) => `collection:${slug}`

function languagesOf(paste: Listed) {
  const languages =
    "languages" in paste ? paste.languages : paste.files.map((file) => file.language)
  return [...new Set(languages)].join(", ")
}

const VISIBILITY_ICONS = { public: "globe", unlisted: "link", private: "lock" } as const

export function createSnippets(context: vscode.ExtensionContext, auth: Auth) {
  const changed = new vscode.EventEmitter<Node | undefined>()
  const lists = new Map<string, Promise<List>>()
  const pastes = new Map<string, Promise<Paste>>()
  let query = ""
  let signedIn = false

  const setContext = (key: string, value: boolean) =>
    vscode.commands.executeCommand("setContext", `sniptide.${key}`, value)

  function fetchList(list: string, cursor?: string): Promise<List> {
    return auth.sessions.run<List>((client) => {
      if (list === RECENT) return client.listPastes({ limit: PAGE_SIZE, cursor })
      if (list === SEARCH) return client.listPastes({ q: query, limit: PAGE_SIZE, cursor })
      return client.collectionPastes(list.slice("collection:".length), cursor)
    })
  }

  function load(list: string) {
    let loading = lists.get(list)
    if (!loading) {
      loading = fetchList(list)
      lists.set(list, loading)
      // A failed load isn't kept, so opening the list again tries again.
      loading.catch(() => lists.delete(list))
    }
    return loading
  }

  async function children(list: string): Promise<Node[]> {
    const { pastes: items, nextCursor } = await load(list)
    const nodes: Node[] = items.map((paste) => ({ kind: "snippet", paste, list }))
    if (nextCursor) nodes.push({ kind: "more", list })
    return nodes
  }

  async function root(): Promise<Node[]> {
    if (query) {
      const results = await children(SEARCH)
      view.message = results.length ? undefined : messages.noResults(query)
      return results
    }
    const [recent, { collections }] = await Promise.all([
      load(RECENT),
      auth.sessions.run((client) => client.listCollections()),
    ])
    const empty = recent.pastes.length === 0 && collections.length === 0
    await setContext("empty", empty)
    view.message = undefined
    if (empty) return []
    return [
      { kind: "recent" },
      ...collections.map((collection): Node => ({ kind: "collection", collection })),
    ]
  }

  const provider: vscode.TreeDataProvider<Node> = {
    onDidChangeTreeData: changed.event,

    async getChildren(node) {
      if (!signedIn) return []
      try {
        if (!node) return await root()
        if (node.kind === "recent") return await children(RECENT)
        if (node.kind === "collection") return await children(collectionList(node.collection.slug))
        return []
      } catch (error) {
        // The stored session is gone, so the view goes back to its sign-in prompt.
        if (error instanceof SignedOutError) void auth.refresh()
        else view.message = error instanceof Error ? describe(error) : messages.loadFailed
        return []
      }
    },

    getTreeItem(node) {
      if (node.kind === "recent") {
        const item = new vscode.TreeItem(messages.recent, vscode.TreeItemCollapsibleState.Expanded)
        item.id = RECENT
        item.iconPath = new vscode.ThemeIcon("history")
        return item
      }
      if (node.kind === "collection") {
        const { collection } = node
        const item = new vscode.TreeItem(collection.name, vscode.TreeItemCollapsibleState.Collapsed)
        item.id = collectionList(collection.slug)
        item.description = messages.snippetCount(collection.pasteCount)
        // Not the "folder" icon, which file icon themes replace and which changes how rows align.
        item.iconPath = new vscode.ThemeIcon("library")
        return item
      }
      if (node.kind === "more") {
        const item = new vscode.TreeItem(messages.loadMore)
        item.id = `${node.list}/more`
        item.command = { command: "sniptide.loadMore", title: messages.loadMore, arguments: [node] }
        return item
      }
      const { paste } = node
      const item = new vscode.TreeItem(paste.title)
      item.id = `${node.list}/${paste.id}`
      item.description = languagesOf(paste)
      item.iconPath = new vscode.ThemeIcon(VISIBILITY_ICONS[paste.visibility])
      item.contextValue = "snippet"
      item.tooltip = [paste.title, paste.description, messages.visibilityNames[paste.visibility]]
        .filter(Boolean)
        .join("\n")
      item.command = { command: "sniptide.preview", title: paste.title, arguments: [node] }
      return item
    },
  }

  const view = vscode.window.createTreeView(VIEW_ID, { treeDataProvider: provider })

  function refresh() {
    lists.clear()
    pastes.clear()
    changed.fire(undefined)
  }

  async function search(next: string) {
    query = next.trim()
    lists.delete(SEARCH)
    view.description = query ? messages.resultsFor(query) : undefined
    await setContext("searching", query !== "")
    changed.fire(undefined)
  }

  async function loadMore(node: MoreNode) {
    const current = await load(node.list)
    if (!current.nextCursor) return
    try {
      const next = await fetchList(node.list, current.nextCursor)
      lists.set(
        node.list,
        Promise.resolve({
          pastes: [...current.pastes, ...next.pastes],
          nextCursor: next.nextCursor,
        }),
      )
      changed.fire(undefined)
    } catch (error) {
      void vscode.window.showErrorMessage(describe(error))
    }
  }

  // The whole paste with its files. The lists of recent snippets and search results carry none.
  function read(id: string) {
    let reading = pastes.get(id)
    if (!reading) {
      reading = auth.sessions.run((client) => client.readPaste(id)).then(({ paste }) => paste)
      pastes.set(id, reading)
      reading.catch(() => pastes.delete(id))
    }
    return reading
  }

  // A read-only document for one file of a paste. The file's name ends the address, so the
  // editor picks the language from its extension.
  const contentUri = (paste: Paste, index: number) =>
    vscode.Uri.from({
      scheme: CONTENT_SCHEME,
      path: `/${paste.id}/${index}/${paste.files[index]?.name ?? ""}`,
    })

  context.subscriptions.push(
    changed,
    view,
    vscode.workspace.registerTextDocumentContentProvider(CONTENT_SCHEME, {
      async provideTextDocumentContent(uri) {
        const [, id = "", index = "0"] = uri.path.split("/")
        const paste = await read(id)
        return paste.files[Number(index)]?.content ?? ""
      },
    }),
    auth.onDidChange((account) => {
      signedIn = account !== null
      query = ""
      view.description = undefined
      void setContext("searching", false)
      void setContext("empty", false)
      refresh()
    }),
  )

  return { refresh, search, loadMore, read, contentUri, query: () => query }
}

export type Snippets = ReturnType<typeof createSnippets>
