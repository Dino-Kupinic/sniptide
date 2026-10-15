# @sniptide/ui

Sniptide's shared React components (shadcn on Base UI), brand pieces (`Logo`, `Stripes`) and the
Tailwind v4 theme. The Sniptide app uses it from this monorepo; the website installs it from npm.

The package ships TypeScript source, so the consuming Next.js app compiles it.

## Use it in a Next.js app

```bash
bun add @sniptide/ui
```

```ts
// next.config.ts
const nextConfig = { transpilePackages: ["@sniptide/ui"] }
```

```js
// postcss.config.mjs
export { default } from "@sniptide/ui/postcss.config"
```

```tsx
// app/layout.tsx
import "@sniptide/ui/globals.css"
import { Button } from "@sniptide/ui/components/button"
import { Logo } from "@sniptide/ui/components/logo"
```

The theme reads four font variables, so set them on `<html>` (for example with `next/font`):
`--font-sans` (Inter), `--font-mono` (JetBrains Mono), `--font-heading` (Stack Sans Headline) and
`--font-logo` (Stack Sans Notch, used only by the wordmark).

`globals.css` already tells Tailwind to scan this package's components; your own files are found
by Tailwind's automatic source detection.

## Feedback states

Every async action ends in the same three states, built from these pieces:

- **Loading:** `<Button loading={pending}>` shows a `Spinner` in place of the button's icon, ignores
  clicks and sets `aria-busy`. Use `Skeleton` for content that is still on its way.
- **Success:** `SuccessCheck` is a check that draws itself in (a copy button swaps its icon for it).
  Actions without a button of their own, like menu items, call `toast.success(...)`. Mount
  `<Toaster />` once in the root layout.
- **Error:** `FormError` for a failure next to the thing that failed (`banner` on top of a form,
  `inline` under a field), `toast.error(...)` for actions with no place for a message.

Spinners fall back to a slow pulse and the check and skeletons stop animating when the visitor
prefers reduced motion.

## Releasing

Bump `version` in `package.json` and merge to `main`. The `Publish @sniptide/ui` workflow stages
any version that isn't on npm yet (Trusted Publishing, no token). Approve it with 2FA to publish:

```bash
npm stage list @sniptide/ui
npm stage approve <stage-id>
```

## License

AGPL-3.0-only, like the rest of Sniptide.
