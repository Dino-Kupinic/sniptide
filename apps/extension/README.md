# Sniptide for Chrome

A Manifest V3 extension that saves the text you select on a web page as a Sniptide paste and
copies its link. The reader-facing guide is
[Browser extension](../docs/content/docs/browser-extension.mdx).

## Develop

```bash
bun --filter extension dev     # builds dist/ and rebuilds when a source file changes
bun run test:extension         # the unit tests
```

Open `chrome://extensions`, turn on **Developer mode**, select **Load unpacked** and choose
`apps/extension/dist`. After a rebuild, select the reload arrow on the extension's card to pick up
a change to the service worker. The popup picks up changes the next time it opens.

To sign in to a local instance, run `bun dev` from the repository root, select **Use a
self-hosted instance** in the popup and enter `http://localhost:3000`.

## Layout

| Path | What it holds |
| --- | --- |
| `manifest.json` | The extension manifest. The build fills in the version from `package.json`. |
| `src/background.ts` | The service worker: the context menu, the shortcut, and every request to Sniptide. |
| `src/popup` | The popup, built in React from the `@sniptide/ui` components and theme. |
| `src/lib/oauth.ts`, `session.ts` | The OAuth 2.1 flow with PKCE, token storage and renewal. |
| `src/lib/capture.ts` | How a selection becomes a paste: title, file name and description. |
| `src/lib/page.ts` | The functions that run inside a web page: reading the selection and showing the toast. |
| `src/lib/messages.ts` | Every sentence the extension shows. |
| `scripts/build.ts` | Bundles the scripts with Bun, compiles the Tailwind theme and copies the fonts. |

The service worker owns the tokens. The popup and the toast ask it to act through
`chrome.runtime.sendMessage` (`src/lib/protocol.ts`), so one place renews the access token and a
refresh token is never used twice.

A function in `src/lib/page.ts` is sent to the page as source text. It can't use imports, shared
helpers or module constants. The toast repeats the theme's colors for the same reason, so change
a color in `packages/ui/src/styles/globals.css` first and copy it there.

## Release

Set the version in `package.json`, run `bun --filter extension build` and zip the contents of
`dist/` for the Chrome Web Store. The extension requests `https://app.sniptide.com` up front and
any other instance at sign-in, which keeps the store's permission review short.
