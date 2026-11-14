import type { Paste, PasteSummary } from "@sniptide/sdk"
import * as vscode from "vscode"
import type { Auth } from "./auth"
import { report } from "./errors"
import { captureFromSelection, type EditorSelection, MAX_TITLE, titleFor } from "./lib/capture"
import { messages } from "./lib/messages"
import {
  EXPIRIES,
  rememberedOptions,
  type ShareOptions,
  share,
  summarize,
  VISIBILITIES,
} from "./lib/share"
import type { SnippetNode, Snippets } from "./snippets"

const OPTIONS_KEY = "sniptide.shareOptions"
const MAX_COLLECTION_NAME = 40
const SEARCH_DELAY_MS = 200

// What the commands act on: the selection, or the whole file when nothing is selected. Several
// selections are joined in the order they appear.
function readSelection(editor: vscode.TextEditor): EditorSelection | null {
  const { document } = editor
  const selections = editor.selections
    .filter((selection) => !selection.isEmpty)
    .sort((a, b) => a.start.compareTo(b.start))
  const text = selections.length
    ? selections.map((selection) => document.getText(selection)).join("\n")
    : document.getText()
  if (!text.trim()) return null
  const [only] = selections.length === 1 ? selections : []
  return {
    text,
    fileName: document.isUntitled ? "" : (document.uri.path.split("/").pop() ?? ""),
    languageId: document.languageId,
    lines: only
      ? {
          start: only.start.line + 1,
          // A selection that ends at the start of a line doesn't include that line.
          end:
            only.end.character === 0 && only.end.line > only.start.line
              ? only.end.line
              : only.end.line + 1,
        }
      : null,
  }
}

function currentSelection() {
  const editor = vscode.window.activeTextEditor
  const selection = editor ? readSelection(editor) : null
  if (!selection) void vscode.window.showErrorMessage(messages.nothingToShare)
  return selection
}

const working = <T>(title: string, task: () => Promise<T>) =>
  vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title }, task)

type Pick<T> = vscode.QuickPickItem & { value: T }

// One list with the link on top, so Enter shares with the options from last time, and a row for
// each option that opens its choices and comes back.
async function pickShareOptions(title: string, initial: ShareOptions) {
  let options = initial
  while (true) {
    const picked = await vscode.window.showQuickPick<Pick<"create" | keyof ShareOptions>>(
      [
        {
          value: "create",
          label: `$(link) ${messages.createLink}`,
          description: summarize(options),
        },
        {
          value: "visibility",
          label: `$(eye) ${messages.visibility}`,
          description: messages.visibilityNames[options.visibility],
        },
        {
          value: "expiry",
          label: `$(clock) ${messages.expires}`,
          description: messages.expiryNames[options.expiry],
        },
        {
          value: "password",
          label: `$(lock) ${messages.password}`,
          description: options.password ? messages.passwordSet : messages.noPassword,
        },
      ],
      { title },
    )
    if (!picked) return undefined
    if (picked.value === "create") return options

    if (picked.value === "visibility") {
      const choice = await vscode.window.showQuickPick(
        VISIBILITIES.map((value) => ({
          value,
          label: messages.visibilityNames[value],
          detail: messages.visibilityDetails[value],
        })),
        { title: messages.visibility },
      )
      if (choice) options = { ...options, visibility: choice.value }
    } else if (picked.value === "expiry") {
      const choice = await vscode.window.showQuickPick(
        EXPIRIES.map((value) => ({ value, label: messages.expiryNames[value] })),
        { title: messages.expires },
      )
      if (choice) options = { ...options, expiry: choice.value }
    } else {
      const password = await vscode.window.showInputBox({
        title: messages.password,
        prompt: messages.passwordPrompt,
        password: true,
      })
      if (password !== undefined) options = { ...options, password: password || null }
    }
  }
}

export function registerCommands(context: vscode.ExtensionContext, auth: Auth, snippets: Snippets) {
  const { run } = auth.sessions

  // Stops a command that needs an account before it asks any question.
  async function signedIn() {
    if (await auth.sessions.account()) return true
    const choice = await vscode.window.showErrorMessage(messages.signInFirst, messages.signIn)
    if (choice) await vscode.commands.executeCommand("sniptide.signIn")
    return false
  }

  async function shareSelection() {
    const selection = currentSelection()
    if (!selection || !(await signedIn())) return
    const options = await pickShareOptions(
      messages.shareTitle(titleFor(selection)),
      rememberedOptions(context.globalState.get(OPTIONS_KEY)),
    )
    if (!options) return
    const paste = await working(messages.sharing, () =>
      share(run, captureFromSelection(selection, options), options),
    )
    await vscode.env.clipboard.writeText(paste.url)
    await context.globalState.update(OPTIONS_KEY, {
      visibility: options.visibility,
      expiry: options.expiry,
    })
    snippets.refresh()
    const choice = await vscode.window.showInformationMessage(
      messages.linkCopied,
      messages.open,
      messages.undo,
    )
    if (choice === messages.open) await vscode.env.openExternal(vscode.Uri.parse(paste.url))
    if (choice === messages.undo) {
      await run((client) => client.trashPaste(paste.id))
      snippets.refresh()
      void vscode.window.showInformationMessage(messages.movedToTrash)
    }
  }

  // The collection to save into: null for none, undefined when the reader backed out.
  async function pickCollection(): Promise<{ slug: string; name: string } | null | undefined> {
    const { collections } = await run((client) => client.listCollections())
    type Choice = Pick<"collection" | "none" | "new"> & { slug?: string; name?: string }
    const picked = await vscode.window.showQuickPick<Choice>(
      [
        ...collections.map(
          (collection): Choice => ({
            value: "collection",
            slug: collection.slug,
            name: collection.name,
            label: `$(library) ${collection.name}`,
            description: messages.snippetCount(collection.pasteCount),
          }),
        ),
        { value: "none", label: messages.noCollection },
        { value: "new", label: `$(add) ${messages.newCollection}` },
      ],
      { title: messages.saveTitle, placeHolder: messages.collectionPlaceholder },
    )
    if (!picked) return undefined
    if (picked.value === "none") return null
    if (picked.value === "collection") return { slug: picked.slug ?? "", name: picked.name ?? "" }
    const name = await vscode.window.showInputBox({
      title: messages.newCollection,
      prompt: messages.newCollectionPrompt,
      validateInput: (text) =>
        text.trim() && text.trim().length <= MAX_COLLECTION_NAME
          ? null
          : messages.collectionNameEmpty,
    })
    if (name === undefined) return undefined
    const { collection } = await run((client) =>
      client.createCollection(name.trim(), crypto.randomUUID()),
    )
    return collection
  }

  async function saveSelection() {
    const selection = currentSelection()
    if (!selection || !(await signedIn())) return
    const collection = await pickCollection()
    if (collection === undefined) return
    const title = await vscode.window.showInputBox({
      title: messages.saveTitle,
      prompt: messages.titlePrompt,
      value: titleFor(selection),
      validateInput: (text) =>
        text.trim() && text.trim().length <= MAX_TITLE ? null : messages.titleEmpty,
    })
    if (title === undefined) return
    const capture = captureFromSelection(selection, {
      visibility: "private",
      title,
      collection: collection?.slug,
    })
    const { paste } = await working(messages.saving, () =>
      run((client) => client.createPaste(capture, crypto.randomUUID())),
    )
    snippets.refresh()
    const choice = await vscode.window.showInformationMessage(
      collection ? messages.savedTo(collection.name) : messages.saved,
      messages.open,
    )
    if (choice) await vscode.env.openExternal(vscode.Uri.parse(paste.url))
  }

  // The index of the file to use: the only one, or the one the reader picks.
  async function pickFile(paste: Paste) {
    if (paste.files.length <= 1) return paste.files.length - 1
    const picked = await vscode.window.showQuickPick(
      paste.files.map((file, index) => ({ index, label: file.name, description: file.language })),
      { title: paste.title, placeHolder: messages.chooseFile },
    )
    return picked ? picked.index : -1
  }

  async function fileOf(id: string) {
    const paste = await snippets.read(id)
    const index = await pickFile(paste)
    const file = paste.files[index]
    return file ? { paste, index, file } : null
  }

  async function insert(id: string) {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
      void vscode.window.showErrorMessage(messages.noEditor)
      return
    }
    const picked = await fileOf(id)
    if (!picked) return
    await editor.edit((edit) => {
      for (const selection of editor.selections) edit.replace(selection, picked.file.content)
    })
    await vscode.window.showTextDocument(editor.document, editor.viewColumn)
  }

  async function copy(id: string) {
    const picked = await fileOf(id)
    if (!picked) return
    await vscode.env.clipboard.writeText(picked.file.content)
    vscode.window.setStatusBarMessage(messages.copied, 3000)
  }

  async function preview(id: string) {
    const picked = await fileOf(id)
    if (!picked) return
    await vscode.window.showTextDocument(snippets.contentUri(picked.paste, picked.index), {
      preview: true,
    })
  }

  // A search that asks Sniptide as the reader types, so it finds a snippet by its content too.
  function insertSnippet() {
    const picker = vscode.window.createQuickPick<vscode.QuickPickItem & { paste: PasteSummary }>()
    picker.placeholder = messages.insertPlaceholder
    picker.matchOnDescription = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let latest = 0
    const load = async (q: string) => {
      const request = ++latest
      picker.busy = true
      try {
        const page = await run((client) => client.listPastes({ q: q || undefined, limit: 20 }))
        if (request !== latest) return
        picker.items = page.pastes.map((paste) => ({
          paste,
          label: paste.title,
          description: paste.languages.join(", "),
          detail: paste.description || undefined,
          // Sniptide already matched these, by content as well as by title.
          alwaysShow: true,
        }))
      } catch (error) {
        if (request !== latest) return
        picker.hide()
        void report(error)
      } finally {
        if (request === latest) picker.busy = false
      }
    }
    picker.onDidChangeValue((value) => {
      clearTimeout(timer)
      timer = setTimeout(() => void load(value.trim()), SEARCH_DELAY_MS)
    })
    picker.onDidAccept(() => {
      const [picked] = picker.selectedItems
      picker.hide()
      if (picked) insert(picked.paste.id).catch(report)
    })
    picker.onDidHide(() => {
      clearTimeout(timer)
      picker.dispose()
    })
    picker.show()
    void load("")
  }

  async function search() {
    const value = await vscode.window.showInputBox({
      prompt: messages.searchPrompt,
      placeHolder: messages.searchPlaceholder,
      value: snippets.query(),
    })
    if (value !== undefined) await snippets.search(value)
  }

  const command = (name: string, handler: (...args: never[]) => unknown) =>
    vscode.commands.registerCommand(`sniptide.${name}`, async (...args: never[]) => {
      try {
        await handler(...args)
      } catch (error) {
        await report(error)
      }
    })
  const onSnippet = (handler: (id: string) => Promise<void>) => (node?: SnippetNode) =>
    node?.kind === "snippet" ? handler(node.paste.id) : undefined

  context.subscriptions.push(
    command("shareSelection", shareSelection),
    command("saveSelection", saveSelection),
    command("insertSnippet", async () => {
      if (await signedIn()) insertSnippet()
    }),
    command("search", search),
    command("clearSearch", () => snippets.search("")),
    command("refresh", () => snippets.refresh()),
    command("loadMore", snippets.loadMore),
    command("preview", onSnippet(preview)),
    command("insert", onSnippet(insert)),
    command("copy", onSnippet(copy)),
    command(
      "copyLink",
      onSnippet(async (id) => {
        const paste = await snippets.read(id)
        await vscode.env.clipboard.writeText(paste.url)
        vscode.window.setStatusBarMessage(messages.linkCopied, 3000)
      }),
    ),
    command(
      "openInBrowser",
      onSnippet(async (id) => {
        const paste = await snippets.read(id)
        await vscode.env.openExternal(vscode.Uri.parse(paste.url))
      }),
    ),
  )
}
