# Sniptide for VS Code

Share the code you select as a [Sniptide](https://sniptide.com) link, save it to a collection, and
insert your snippets without leaving the editor. The extension works in VS Code and in the editors
built on it, such as Cursor, Windsurf and VSCodium.

The full guide is [VS Code extension](https://docs.sniptide.com/vscode-extension) in the Sniptide
docs.

## Sign in

Run **Sniptide: Sign In** from the Command Palette, or select **Sign In to Sniptide** in the
Sniptide view. Your browser opens a consent screen, and the editor is connected after you allow
access. You can also use a self-hosted instance or paste an API token. The connection is kept in
the editor's secret storage, which your operating system's keychain protects.

## Share a selection

Select code, then run **Sniptide: Share Selection as Link** from the Command Palette or the
editor's context menu. Press Enter to create an unlisted link, or change the visibility, the
expiry and the password first. The link is copied to your clipboard, and **Undo** in the
notification moves the paste to the trash. With nothing selected, the command shares the whole
file.

## Save a selection

**Sniptide: Save Selection as Snippet** saves the selection as a private snippet. You choose a
collection, or create one, and name the snippet.

## Browse and insert

The Sniptide view in the Activity Bar lists your recent snippets and your collections. Select a
snippet to read it, and use the buttons on its row to insert it at the cursor or copy it. The
search button finds snippets by title or content. **Sniptide: Insert Snippet** searches from the
Command Palette and inserts the snippet you choose.

## Privacy

A release from the Marketplace or Open VSX sends two anonymous events to Sniptide: one when the
extension is first installed and one when an account connects. They hold the editor's name, the
extension's version, how you signed in and whether the instance is sniptide.com. They never hold
code, file names, titles, links or the address of a self-hosted instance. Turn the editor's
`telemetry.telemetryLevel` setting to `off` to send nothing.

## Develop

```bash
bun --filter sniptide-vscode dev    # builds dist/extension.js and rebuilds on change
bun run test:vscode                 # the unit tests
```

Open `apps/vscode` in VS Code and press F5 to start an Extension Development Host with the
extension loaded. To sign in to a local instance, run `bun dev` from the repository root, choose
**Use a self-hosted instance** and enter `http://localhost:3000`.

| Path | What it holds |
| --- | --- |
| `package.json` | The manifest: commands, menus, the Sniptide view and its welcome text. |
| `src/extension.ts` | Activation, which wires the pieces below together. |
| `src/auth.ts` | Sign-in and sign-out, SecretStorage and the URI handler for the OAuth redirect. |
| `src/commands.ts` | Every command: share, save, insert, copy and search. |
| `src/snippets.ts` | The Snippets tree view and the read-only documents that show a snippet. |
| `src/lib` | The rules without the editor API, which the unit tests cover: sessions, turning a selection into a paste, share options and analytics. |
| `scripts/build.ts` | Bundles the extension with Bun. |

The OAuth 2.1 flow with PKCE lives in `packages/oauth-client`, shared with the browser extension.

## Release

Set the version in `package.json`, merge, then run the **Publish VS Code extension** workflow from
`main`. It tests and packages the extension, then publishes the same `.vsix` to the VS Code
Marketplace and to Open VSX. The workflow reads `VSCE_PAT` and `OVSX_PAT` from the repository's
secrets and the PostHog project key from the `POSTHOG_KEY` variable.
