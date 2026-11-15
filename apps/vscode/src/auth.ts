import { SniptideError } from "@sniptide/sdk"
import { instanceOrigin, OAuthError } from "@workspace/oauth-client"
import * as vscode from "vscode"
import { report } from "./errors"
import { messages } from "./lib/messages"
import { type Account, createSessions, type Session } from "./lib/session"
import { HOSTED_INSTANCE, type Telemetry } from "./lib/telemetry"

// Sign-in and sign-out in the editor: the session lives in SecretStorage, which the operating
// system's keychain backs, and the OAuth redirect comes back through the extension's URI handler.

const SECRET_KEY = "sniptide.session"
const CALLBACK_PATH = "/oauth"
const SIGN_IN_TIMEOUT_MS = 5 * 60_000

function parseSession(value: string | undefined): Session | null {
  if (!value) return null
  try {
    const session = JSON.parse(value)
    return session?.kind === "oauth" || session?.kind === "token" ? session : null
  } catch {
    return null
  }
}

export function createAuth(context: vscode.ExtensionContext, telemetry: Telemetry) {
  const changed = new vscode.EventEmitter<Account | null>()
  // The sign-in that waits for its redirect, when there is one.
  let waiting: ((query: string) => void) | null = null

  const sessions = createSessions({
    fetch,
    storage: {
      get: async () => parseSession(await context.secrets.get(SECRET_KEY)),
      async set(session) {
        if (session) await context.secrets.store(SECRET_KEY, JSON.stringify(session))
        else await context.secrets.delete(SECRET_KEY)
      },
    },
    // asExternalUri turns the editor's own address into one the browser can reach: the same
    // vscode:// address on a desktop, and an https address for an editor that runs in a browser.
    // Each fork has its own scheme, such as cursor:// and windsurf://.
    async redirectUri() {
      const local = vscode.Uri.parse(
        `${vscode.env.uriScheme}://${context.extension.id}${CALLBACK_PATH}`,
      )
      return (await vscode.env.asExternalUri(local)).toString(true)
    },
    authorize: async (url) =>
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: messages.waitingForBrowser,
          cancellable: true,
        },
        (_progress, cancellation) =>
          new Promise<string>((resolve, reject) => {
            const finish = (settle: () => void) => {
              clearTimeout(timer)
              waiting = null
              settle()
            }
            const fail = (message: string, code: string) =>
              finish(() => reject(new OAuthError(message, code)))
            const timer = setTimeout(
              () => fail(messages.signInTimedOut, "timeout"),
              SIGN_IN_TIMEOUT_MS,
            )
            waiting = (query) => finish(() => resolve(query))
            cancellation.onCancellationRequested(() => fail(messages.signInCancelled, "cancelled"))
            // The address goes to the browser as the string it is. Parsing it into a Uri decodes
            // and re-encodes the query, which breaks a redirect address that has its own query.
            vscode.env.openExternal(url as unknown as vscode.Uri).then(
              (opened) => {
                if (!opened) fail(messages.browserDidNotOpen, "browser")
              },
              () => fail(messages.browserDidNotOpen, "browser"),
            )
          }),
      ),
  })

  // Reads who is signed in and tells the listeners when that changed. A sign-in reaches this
  // twice, from the command and from the storage event, and the second read changes nothing.
  let known: string | undefined
  async function refresh() {
    const account = await sessions.account()
    const identity = JSON.stringify(account)
    if (identity !== known) {
      known = identity
      await vscode.commands.executeCommand("setContext", "sniptide.signedIn", account !== null)
      changed.fire(account)
    }
    return account
  }

  async function askInstance(prompt: string, value = "") {
    const answer = await vscode.window.showInputBox({
      prompt,
      value,
      placeHolder: messages.instancePlaceholder,
      ignoreFocusOut: true,
      validateInput(text) {
        try {
          instanceOrigin(text)
          return null
        } catch (error) {
          return error instanceof OAuthError ? error.message : messages.unexpected
        }
      },
    })
    return answer === undefined ? undefined : instanceOrigin(answer)
  }

  async function connect(method: Account["method"], work: () => Promise<Account>) {
    try {
      const account = await work()
      await refresh()
      void telemetry.connected(method, account.instance)
      void vscode.window.showInformationMessage(messages.signedIn(account.name))
    } catch (error) {
      const rejected = method === "token" && error instanceof SniptideError && error.status === 401
      if (rejected) await vscode.window.showErrorMessage(messages.tokenRejected)
      else await report(error)
    }
  }

  async function signIn() {
    const choice = await vscode.window.showQuickPick(
      [
        {
          id: "browser",
          label: `$(globe) ${messages.signInBrowser}`,
          detail: messages.signInBrowserDetail,
        },
        {
          id: "self-hosted",
          label: `$(server) ${messages.signInSelfHosted}`,
          detail: messages.signInSelfHostedDetail,
        },
        {
          id: "token",
          label: `$(key) ${messages.signInToken}`,
          detail: messages.signInTokenDetail,
        },
      ],
      { placeHolder: messages.signInPlaceholder },
    )
    if (!choice) return

    if (choice.id === "token") {
      const instance = await askInstance(messages.tokenInstancePrompt, HOSTED_INSTANCE)
      if (!instance) return
      const token = await vscode.window.showInputBox({
        prompt: messages.tokenPrompt,
        placeHolder: messages.tokenPlaceholder,
        password: true,
        ignoreFocusOut: true,
        validateInput: (text) => (text.trim() ? null : messages.tokenEmpty),
      })
      if (!token) return
      await connect("token", () => sessions.signInWithToken(instance, token))
      return
    }

    const instance =
      choice.id === "browser" ? HOSTED_INSTANCE : await askInstance(messages.instancePrompt)
    if (!instance) return
    await connect("oauth", () => sessions.signIn(instance))
  }

  async function signOut() {
    await sessions.signOut()
    await refresh()
    void vscode.window.showInformationMessage(messages.signedOut)
  }

  context.subscriptions.push(
    changed,
    vscode.window.registerUriHandler({
      handleUri(uri) {
        if (uri.path === CALLBACK_PATH) waiting?.(uri.query)
      },
    }),
    // Every window shares the stored session, so a sign-in or sign-out in one reaches the rest.
    context.secrets.onDidChange((event) => {
      if (event.key === SECRET_KEY) void refresh()
    }),
    vscode.commands.registerCommand("sniptide.signIn", signIn),
    vscode.commands.registerCommand("sniptide.signOut", signOut),
  )

  return { sessions, refresh, onDidChange: changed.event }
}

export type Auth = ReturnType<typeof createAuth>
