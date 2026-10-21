---
name: Sniptide
description: Design system for Sniptide, the self-hostable pastebin. Tokens mirror packages/ui/src/styles/globals.css.
colors:
  light:
    background: "#FFFFFF"
    sidebar: "#FAFAFA"
    card: "#FFFFFF"
    muted: "#F4F4F4"
    border: "#E8E8E8"
    foreground: "#1B1919"
    foreground-muted: "#6B6B6B"
    primary: "#2A26EC"
    primary-foreground: "#FFFFFF"
    link: "#2A26EC"
    destructive: "oklch(0.577 0.245 27.325)"
    offset-shadow: "#1B1919"
  dark:
    background: "#121111"
    sidebar: "#0C0B0B"
    card: "#1A1919"
    muted: "#242222"
    border: "#2F2C2C"
    foreground: "#F4F4F4"
    foreground-muted: "#A3A3A3"
    primary: "#3A36FF"
    primary-foreground: "#FFFFFF"
    link: "#6AA3FF"
    destructive: "oklch(0.704 0.191 22.216)"
    offset-shadow: "#4A4646"
  brand:
    blue: "#2A26EC"
    ink: "#1B1919"
    pink: "#F6A9D3"
    pink-ink: "#2B0A1F"
  syntax:
    light:
      keyword: "#2A26EC"
      string: "#047857"
      constant: "#B45309"
      function: "#6D28D9"
      type: "#0E7490"
      property: "#BE123C"
      comment: "#6B6B6B"
      punctuation: "#4A4747"
    dark:
      keyword: "#6AA3FF"
      string: "#5FD3A8"
      constant: "#F5B971"
      function: "#C4B5FD"
      type: "#67D4E8"
      property: "#FB9FB1"
      comment: "#8A8A8A"
      punctuation: "#B0B0B0"
typography:
  families:
    heading: "Stack Sans Headline, system-ui, sans-serif"
    sans: "Inter, system-ui, sans-serif"
    mono: "JetBrains Mono, ui-monospace, monospace"
    display: "Stack Sans Notch, system-ui, sans-serif"
  scale:
    micro: { size: 11px, use: "Kbd, chart labels" }
    caption: { size: 12px, use: "Menu labels, tooltips" }
    small: { size: 13px, leading: 18px, use: "Badges, toasts, segmented control" }
    body: { size: 14px, leading: 20px, use: "Controls, menus, table cells" }
    lead: { size: 16px, leading: 26px, use: "Page intro text" }
    title-sm: { size: 20px, weight: 700, tracking: -0.02em, family: heading, use: "Dialog titles" }
    title: { size: 30px, leading: 36px, weight: 700, tracking: -0.02em, family: heading, use: "Page titles" }
    display: { size: 48px, weight: 700, tracking: -0.03em, family: heading, use: "Landing headlines" }
    display-lg: { size: 72px, weight: 700, tracking: -0.03em, family: heading, use: "Landing hero" }
  weights: { regular: 400, medium: 500, semibold: 600, bold: 700 }
rounded:
  none: 0px
spacing:
  3xs: 2px
  2xs: 4px
  xs: 6px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
  2xl: 24px
  3xl: 28px
  4xl: 48px
  5xl: 64px
  6xl: 96px
  7xl: 120px
layout:
  breakpoints: { mobile: 390px, desktop: 1440px }
  sidebar: { default: 256px, min: 200px, max: "one quarter of the window" }
  form-width: 560px
  page-width: 1440px
  desktop-from: 1024px
elevation:
  menu: "4px 4px 0 0 var(--offset-shadow)"
  dialog: "8px 8px 0 0 var(--offset-shadow)"
  toast: "Tailwind shadow-md"
motion:
  menu: 100ms
  popover-and-dialog: 150ms
  sheet: 200ms
  press: "translate-y-px"
  enter-scale: 0.98
components:
  button:
    height: { xs: 24px, sm: 28px, default: 32px, lg: 36px }
    variants: [default, inverted, outline, secondary, ghost, destructive, link]
  input: { height: 40px, border: 1px, focus-border: "2px primary" }
  badge: { height: 24px, text: 13px, variants: [outline, solid, primary, muted] }
  menu-item: { height: 32px, padding-x: 12px, text: 14px }
  dialog: { max-width: 448px, padding: 24px, border: "1px offset-shadow" }
  checkbox: 16px
  switch: { width: 30px, height: 18px }
  tab-bar: { height: 56px, primary-action: "48px by 40px" }
---

# Sniptide design system

Sniptide uses white or near-black surfaces, one saturated blue, square corners and thin borders. Menus and dialogs carry a hard offset shadow, which is the interface's single flourish.

## Sources of truth

| What | Where |
| --- | --- |
| Tokens in code | `packages/ui/src/styles/globals.css` (palette, `@theme`) and `shadcn.css` (utilities) |
| Components in code | `packages/ui/src/components`, built on Base UI and class-variance-authority |
| Visual design | The Paper file "Sniptide": pages Brand, App screens, Landing v2 and Design tokens |
| Wording and claims | `docs/positioning.md` and `docs/landing-copy.md` |

When code and Paper differ, the shipped code wins for the app, and the Paper token names map onto the shadcn variables below. A change to a token goes into `globals.css` first and into the Paper "Design tokens" page afterwards.

| Paper token | Code variable |
| --- | --- |
| `brand-blue` | `--primary`, `--ring`, `--link` (light) |
| `surface`, `background` | `--background`, `--sidebar` |
| `surface-muted`, `surface-hover` | `--muted`, `--accent`, `--secondary` |
| `border` | `--border`, `--input` |
| `foreground`, `foreground-muted` | `--foreground`, `--muted-foreground` |
| `dark-accent`, `dark-accent-text` | `--primary`, `--link` under `.dark` |

## Color

- Colors come from the CSS variables. Components use Tailwind classes such as `bg-primary` and `text-muted-foreground`, and hex values stay in `globals.css`.
- Brand blue `#2A26EC` fills primary buttons, checked controls, and the focus ring.
- Dark mode uses two blues. The deeper `#3A36FF` fills buttons, and the lighter `#6AA3FF` colors links, code keywords, stars, collection icons and chart bars, because the deeper blue reads at 2.8:1 on the dark surfaces.
- Pink `#F6A9D3` with ink `#2B0A1F` appears on the landing page as one highlighted section and as one tile in the self-hosting grid.
- Red is reserved for destructive actions and invalid fields. The destructive button uses a 10% tint of the red.
- Syntax colors keep keywords in the blue and use muted hues for everything else. Each color clears 4.5:1 on the code backgrounds.
- Text on a colored fill uses `primary-foreground`.

## Typography

- Headings, dialog titles and numeric stats use `font-heading` (Stack Sans Headline) at weight 700 with tracking between `-0.02em` and `-0.03em`.
- Body text and controls use Inter at 14px. Small labels and badges use 13px.
- Paste slugs, code, shortcuts, tooltips and stat labels use JetBrains Mono.
- The landing hero uses Stack Sans Notch for display type, tracked at `-0.03em`.

## Shape and elevation

- Every corner is square. `--radius` is `0`, so the `rounded-*` utilities resolve to square corners and new components skip them.
- Containers use a 1px `border-border`. Menus, popovers and dialogs use a 1px `border-offset-shadow` plus the hard offset shadow: 4px for menus, 8px for dialogs.
- Backdrops use `bg-foreground/20` in light mode and `bg-black/60` in dark mode.
- Toasts use `shadow-md` and a plain border, and tooltips use an inverted `bg-foreground` fill.
- Surfaces prefer a border or a background step over a shadow. Offset shadows belong to floating layers.

## Layout

- The app shell is a resizable sidebar plus a content area. The sidebar defaults to 256px, collapses below 200px, and grows to at most a quarter of the window. Its state lives in the `sidebar` cookie so the server renders it without a jump.
- The sidebar holds Starred, Pastes and Collections as collapsible sections. Shared with me and Trash sit under a "More" menu below the Dashboard link.
- Below 1024px the sidebar becomes a sheet (`w-72`, at most 85vw) and a 56px bottom tab bar appears with the new-paste action as a 48px by 40px blue block.
- Forms are at most 560px wide. Pages stop at 1440px.
- Spacing follows the 4px-based scale in the front matter. Gaps inside a group use 4 to 8px, gaps between groups use 16 to 24px, and section spacing on the landing page uses 96 to 120px.
- The paste side panel is a stack of single-line rows (Sharing, Access, Views, Revisions). A row shows only its label until it opens.

## Components

All components live in `packages/ui/src/components`. Use them before writing new markup, and extend a component with a variant when a new need appears.

- **Button.** Variants `default` (blue), `inverted` (foreground fill), `outline`, `secondary`, `ghost`, `destructive` and `link`. Sizes `xs` 24px, `sm` 28px, `default` 32px, `lg` 36px, with matching icon sizes. A pressed button moves down 1px. The `loading` prop swaps the icon for a spinner, keeps focus and sets `aria-busy`.
- **Input and Textarea.** The input is 40px tall with a 1px border. Focus changes the border to 2px blue and shrinks the padding by 1px so the text stays in place. An invalid field turns the border red.
- **Badge.** 24px tall with 13px text. Variants `outline`, `solid`, `primary` and `muted`.
- **Segmented control.** A radio group on a `muted` track. The checked option sits on `background` with a 1px shadow. Visibility (Private, Unlisted, Public) uses it.
- **Tabs.** Text tabs where the active tab gains a 1px border and the `background` fill.
- **Dropdown menu.** Rows are 32px tall with a 16px muted icon. The highlighted row uses `bg-muted`. Checkable items use a 16px square box that fills with the foreground color.
- **Dialog and alert dialog.** At most 448px wide, 24px padding, 8px offset shadow, and a heading-font title at 20px.
- **Sheet.** Slides in from the edge in 200ms, with a `bg-foreground/30` backdrop.
- **Checkbox and Switch.** The checkbox is 16px and fills blue when checked. The switch is 30px by 18px with a square thumb.
- **Kbd.** 20px tall, mono 11px, on `muted`. Inside a button it turns into a translucent white chip.
- **Toast.** Bottom-aligned, at most `max-w-sm`, with a leading check or alert icon, an optional text action in link blue, and a dismiss button.
- **Tooltip.** Mono 12px text on an inverted fill.
- **Skeleton, Spinner, Progress, Avatar, Table, Select, Popover, Label and FormError** share the same borders, square corners and 14px text.

## Interaction states

- Hover on neutral controls steps the background to `muted`. Hover on filled blue controls uses `bg-primary/85`.
- Keyboard focus shows a `ring-3 ring-ring/30` on buttons, a 2px blue border on inputs and a `ring-2 ring-ring/40` on tabs, toasts and switches.
- Disabled controls use 50% opacity and ignore pointer events.
- Every icon-only control has an accessible name, and every interactive element is reachable and operable by keyboard.
- Scrollbars appear on hover through the `scrollbar-subtle` utility.

## Motion

- Menus open in 100ms, popovers and dialogs in 150ms, sheets and toasts in 200ms.
- Floating layers fade in while scaling from 0.98, anchored at the trigger through `--transform-origin`.
- Buttons answer a press with a 1px downward shift.
- Toast animations switch off under `prefers-reduced-motion`, and new animations do the same.

## Brand

- The mark is six horizontal stripes that taper from a hairline at the top to a full bar at the bottom. It is `#2A26EC` on light surfaces and white on dark surfaces, and it lives in `LogoMark` and `Logo`.
- The wordmark is set in uppercase, `#0A0A0A` on light and white on dark.
- The stripe motif (`Stripes` in `packages/ui`) repeats the mark as hairlines, ink blocks and a blue accent on the sign-in screen and the share-link page.
- The landing page has a dark and a light version in Paper. The dark hero is `#0C0B0B` with the blue stripe horizon, followed by product bands, one pink section, one full-bleed blue call to action and a footer with a large wordmark.

## Copy and content rules

These rules apply to the interface, the landing page, the docs, commit messages, pull request text and this file.

1. Write full sentences. A sentence has a subject and a verb and stands on its own.
2. Skip staccato fragments such as "More reliable. Less expensive." Join the ideas into one sentence or keep the stronger one.
3. Skip the "It's X, not Y" construction and its variants, such as "not just X, but Y". State what the thing is.
4. Follow Jakub Krehel's "less is more". Every word, element and decoration must earn its place, and anything that does not gets removed.
5. Skip eyebrows, kickers, taglines above headings, extra captions and decorative labels. A heading stands alone.
6. Add no text that the reader does not need. An empty state gets one sentence and an action.
7. Use "Sniptide" in sentence case, never "SnipTide".
8. Use the vocabulary of `docs/positioning.md`: paste, snippet, pattern, link, self-host, agent. Avoid "revolutionary", "seamless", "supercharge" and "AI-powered".
9. State security facts plainly, with no fear language. Jokes belong in empty states, never in errors or security copy.
10. Name what Sniptide does not do when a claim could be read too broadly.

## Rules for new UI

- Start from the existing components and the Paper screens. Open the matching Paper page before inventing a layout.
- Use tokens through Tailwind classes. A new color, size or spacing value goes into `globals.css` first.
- Build light and dark together and check both. Check contrast for any new text color on both backgrounds.
- Build the mobile layout in the same change as the desktop layout.
- Add a variant to an existing component when two screens need different looks.
- Keep screens quiet. Prefer information on the surface over cards inside cards, and remove an element before adding one.
