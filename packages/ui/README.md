# Sniptide UI

Build Sniptide screens with the same components, theme and logo as the app. `@sniptide/ui` holds
the shared React components (shadcn on Base UI), the Tailwind CSS v4 theme and the brand `Logo`.
The app imports it from this monorepo, and the marketing site installs it from npm.

The package ships TypeScript and CSS source, so the Next.js app that consumes it compiles it.
[`DESIGN.md`](../../DESIGN.md) describes the tokens and when to use each component.

## Install

```sh
bun add @sniptide/ui
```

It needs React 19.2 or newer and Next.js. Tailwind CSS, PostCSS, Base UI and `lucide-react` come
with the package as dependencies.

## Add it to a Next.js app

1. Compile the package with your app:

   ```ts title="next.config.ts"
   const nextConfig = { transpilePackages: ["@sniptide/ui"] }
   export default nextConfig
   ```

2. Use the package's PostCSS configuration, which loads Tailwind:

   ```js title="postcss.config.mjs"
   export { default } from "@sniptide/ui/postcss.config"
   ```

3. Import the theme once in the root layout, and set the three font variables on `<html>`, for
   example with `next/font`. The theme reads `--font-sans` for Inter, `--font-mono` for Paper Mono
   and `--font-heading` for Archivo.

   ```tsx title="app/layout.tsx"
   import "@sniptide/ui/globals.css"
   import { Toaster } from "@sniptide/ui/components/toast"
   ```

4. Import components by path:

   ```tsx
   import { Button } from "@sniptide/ui/components/button"
   import { Logo } from "@sniptide/ui/components/logo"

   export function Header() {
     return (
       <header>
         <Logo />
         <Button>New paste</Button>
       </header>
     )
   }
   ```

The header renders the wordmark and a blue button that sits on a darker edge and presses down when
you click it. If the button has no fill, `globals.css` is not loaded. If the text falls back to a
system font, the font variables are not set on `<html>`.

`globals.css` tells Tailwind to scan this package's components, and Tailwind's automatic source
detection finds your own files. The light and dark themes switch with the `dark` class on `<html>`.

## What the package exports

| Import path | Contents |
| --- | --- |
| `@sniptide/ui/globals.css` | The palette, the `@theme` tokens and the utilities from `shadcn.css` |
| `@sniptide/ui/postcss.config` | The PostCSS configuration with the Tailwind plugin |
| `@sniptide/ui/components/<name>` | One file per component, such as `button`, `dialog`, `dropdown-menu`, `sheet`, `toast` and `logo` |
| `@sniptide/ui/lib/utils` | `cn`, which joins class names |
| `@sniptide/ui/lib/confetti` | The confetti burst that plays when someone clicks the logo several times in a row |

The components live in [`src/components`](src/components). Each one keeps the shadcn API, so the
[shadcn documentation](https://ui.shadcn.com/docs/components) applies, with the variants that
`DESIGN.md` lists.

## Show loading, success and errors

Every async action ends in one of three states, and these components cover them:

- **Loading.** `<Button loading={pending}>` swaps the button's icon for a `Spinner`, ignores clicks
  and sets `aria-busy`. `Skeleton` holds the place of content that is still loading.
- **Success.** `SuccessCheck` draws a check, which a copy button shows in place of its icon. An
  action without a button of its own, such as a menu item, calls `toast.success(...)`. Mount
  `<Toaster />` once in the root layout.
- **Error.** `FormError` shows a failure next to what failed. Its `banner` variant, the default,
  sits on top of a form, and `inline` sits under a field. An action with no place for a message
  calls `toast.error(...)`.

When the visitor prefers reduced motion, spinners pulse slowly instead of turning, and the check
and skeletons stop animating.

## Fonts and licenses

The Paper Mono files in [`src/fonts`](src/fonts) come from the
[v1.000 release](https://github.com/paper-design/paper-mono/releases/tag/v1.000) under the SIL Open
Font License 1.1 in `OFL.txt`. The logo is drawn as vector paths and needs no font.

## Release a new version

A merge to `main` releases the package after CI passes, but only when its packed contents changed.
The Conventional Commit types since the last release choose the version bump. The workflow installs
the packed package in an isolated consumer, then publishes it through npm Trusted Publishing with
provenance.

The version in `package.json` is a development default, and npm records the released version, so
don't bump it by hand. [Automatic npm releases](../../docs/npm-publishing.md) covers the one-time
owner setup and how to retry a failed release.

## License

AGPL-3.0-only, like the rest of Sniptide.
