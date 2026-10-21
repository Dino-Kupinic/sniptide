# Sniptide design system

**Theme:** light and dark, switched with the `.dark` class

Sniptide uses white or near-black surfaces, one saturated blue, slightly rounded corners and thin borders. Buttons sit on a raised edge that presses down, and menus and dialogs carry a hard offset shadow. The values below mirror `packages/ui/src/styles/globals.css`.

## Sources of truth

| What | Where |
| --- | --- |
| Tokens in code | `packages/ui/src/styles/globals.css` (palette and `@theme`) and `shadcn.css` (utilities) |
| Components in code | `packages/ui/src/components`, built on Base UI and class-variance-authority |
| Visual design | The Paper file "Sniptide" with the pages Brand, App screens, Landing v2 and Design tokens |
| Wording and claims | `docs/positioning.md` and `docs/landing-copy.md` |

When code and Paper differ, the shipped code wins for the app. A change to a token goes into `globals.css` first and into the Paper "Design tokens" page afterwards.

| Paper token | Code variable |
| --- | --- |
| `brand-blue` | `--primary`, `--ring`, `--link` (light) |
| `background`, `surface` | `--sidebar`, `--background` |
| `surface-muted`, `surface-hover` | `--muted`, `--secondary`, `--accent` |
| `border` | `--border`, `--input` |
| `foreground`, `foreground-muted` | `--foreground`, `--muted-foreground` |
| `dark-accent`, `dark-accent-text` | `--primary`, `--link` under `.dark` |

## Tokens: Colors

Components use the Tailwind classes generated from these variables, such as `bg-primary` and `text-muted-foreground`. Hex values stay in `globals.css`.

### Light

| Name | Value | Token | Role |
| --- | --- | --- | --- |
| Paper | `#FFFFFF` | `--background`, `--card`, `--popover` | Page canvas and card surfaces |
| Gallery | `#FAFAFA` | `--sidebar` | Sidebar background |
| Fill | `#F4F4F4` | `--muted`, `--secondary`, `--accent` | Hover rows, tracks, secondary buttons, code chips |
| Hairline | `#E8E8E8` | `--border`, `--input` | Borders and dividers |
| Ink | `#1B1919` | `--foreground` | Text, inverted buttons |
| Shadow grey | `#C4C1C1` | `--offset-shadow` | Offset shadows on menus, dialogs and cards |
| Graphite | `#6B6B6B` | `--muted-foreground` | Secondary text and icons |
| Tide Blue | `#2A26EC` | `--primary`, `--ring`, `--link` | Primary actions, focus, links, active data |
| Red | `oklch(0.577 0.245 27.325)` | `--destructive` | Destructive actions and invalid fields |

### Dark

| Name | Value | Token | Role |
| --- | --- | --- | --- |
| Night | `#121111` | `--background` | Page canvas |
| Deep | `#0C0B0B` | `--sidebar` | Sidebar background and landing hero |
| Raised | `#1A1919` | `--card`, `--popover` | Cards and floating layers |
| Fill | `#242222` | `--muted`, `--secondary`, `--accent` | Hover rows, tracks, secondary buttons |
| Hairline | `#2F2C2C` | `--border`, `--input` | Borders and dividers |
| Snow | `#F4F4F4` | `--foreground` | Text |
| Ash | `#A3A3A3` | `--muted-foreground` | Secondary text and icons |
| Tide Blue | `#3A36FF` | `--primary`, `--ring` | Button fills (white on it is 6.7:1) |
| Sky Blue | `#6AA3FF` | `--link` | Links, code keywords, stars, collection icons, chart bars (7.5:1 on the surfaces) |
| Offset grey | `#3A3737` | `--offset-shadow` | Offset shadows, because white shadows glare on dark surfaces |

### Brand

| Name | Value | Token | Role |
| --- | --- | --- | --- |
| Brand blue | `#2A26EC` | `--logo-primary` (light), Paper `brand-blue` | Logo mark and marketing blue |
| Inverse blue | `#1B17C6` | `--logo-primary` (dark) | Logo mark on dark surfaces |
| Pink | `#F6A9D3` | Paper `brand-pink` | The one highlighted section on the landing page |
| Pink ink | `#2B0A1F` | Paper `brand-pink-ink` | Text and panels on the pink section |

### Syntax

| Token | Light | Dark |
| --- | --- | --- |
| `--syntax-keyword`, `--syntax-link` | `#2A26EC` | `#6AA3FF` |
| `--syntax-string` | `#047857` | `#5FD3A8` |
| `--syntax-constant` | `#B45309` | `#F5B971` |
| `--syntax-function` | `#6D28D9` | `#C4B5FD` |
| `--syntax-type` | `#0E7490` | `#67D4E8` |
| `--syntax-property` | `#BE123C` | `#FB9FB1` |
| `--syntax-comment` | `#6B6B6B` | `#8A8A8A` |
| `--syntax-punctuation` | `#4A4747` | `#B0B0B0` |
| `--syntax-foreground` | `#1B1919` | `#F4F4F4` |

Keywords share the brand blue and the other hues stay muted, so blue leads. Every color clears 4.5:1 on its code background.

## Tokens: Typography

| Family | Token | Used for |
| --- | --- | --- |
| Stack Sans Headline, weight 700 | `--font-heading` | Page titles, dialog titles, stat numbers, landing headlines |
| Inter | `--font-sans` | Body text, controls, menus |
| JetBrains Mono | `--font-mono` | Paste slugs, code, shortcuts, tooltips, stat labels |
| Stack Sans Notch | Paper `--font-display` | Landing hero display type |

### Type scale

| Role | Family | Weight | Size | Line height | Tracking | Used for |
| --- | --- | --- | --- | --- | --- | --- |
| micro | mono | 400 | 11px | default | normal | Kbd |
| caption | sans or mono | 400 | 12px | default | normal | Menu labels, tooltips |
| small | sans | 400, 500 | 13px | 18px | normal | Badges, toasts, segmented control |
| body | sans | 400, 500 | 14px | 20px | normal | Controls, menus, table cells |
| lead | sans | 400 | 16px | 26px | normal | Page intro text |
| title-sm | heading | 700 | 20px | 28px | -0.02em | Dialog titles |
| title | heading | 700 | 30px | 36px | -0.02em | Page titles |
| display | heading or display | 700 | 48px | per screen | -0.03em | Landing section headlines |
| display-lg | heading or display | 700 | 72px | per screen | -0.03em | Landing hero |

Large type uses tighter tracking, and small labels use normal tracking.

## Tokens: Spacing and shapes

**Base unit:** 4px

Paper tokens `--spacing-3xs` to `--spacing-7xl` use these values. Components in code take them as Tailwind spacing steps.

| Name | Value |
| --- | --- |
| 3xs | 2px |
| 2xs | 4px |
| xs | 6px |
| sm | 8px |
| md | 12px |
| lg | 16px |
| xl | 20px |
| 2xl | 24px |
| 3xl | 28px |
| 4xl | 48px |
| 5xl | 64px |
| 6xl | 96px |
| 7xl | 120px |

### Border radius

| Class | Value | Element |
| --- | --- | --- |
| `rounded-lg` | 6px (`--radius`) | Buttons, icon buttons from 32px up, inputs, selects, segmented control, panels, cards, tables, banners, menus, popovers, dialogs, toasts, the app content area |
| `rounded-md` | 4.8px | Badges, tabs, chips, pills, icon buttons under 32px, sidebar rows, avatars, tooltips, skeletons |
| `rounded-sm` | 3.6px | Kbd, checkboxes, counters, the switch, progress tracks, chart labels |

Only surfaces attached to a screen edge stay square: the mobile top bar, the tab bar and sheets.

`--radius` in `globals.css` is the one value to tune. `rounded-md` and `rounded-sm` derive from it at 0.8 and 0.6 times. A panel whose header or body has its own fill also sets `overflow-hidden` so the fill follows the corner.

### Layout

| Name | Value |
| --- | --- |
| Mobile breakpoint | 390px |
| Desktop breakpoint | 1440px, also the page maximum |
| Desktop shell from | 1024px |
| Sidebar width | 256px by default, 200px minimum, a quarter of the window at most |
| Form width | 560px |
| Mobile tab bar | 56px tall |
| Dialog padding | 24px |

## Components

All components live in `packages/ui/src/components`. Use them before writing new markup, and extend a component with a variant when a new need appears.

### Button
**Role:** Every action.

Variants: `default` (blue fill), `inverted` (foreground fill), `outline`, `secondary`, `ghost`, `destructive` (10% red tint) and `link`. Sizes: `xs` 24px, `sm` 28px, `default` 32px, `lg` 36px, plus `icon`, `icon-xs`, `icon-sm` and `icon-lg`. Text is 14px weight 500 and padding is 12px. Every variant except `ghost` and `link` is raised: a 3px bottom border in a darker shade of its fill (`--depth`) forms an edge inside the button's own height, so a raised button is exactly as tall as its size says. Hover lifts it 1px, and a press thins the edge to 1px while the label sinks 2px. `ghost` and `link` stay flat and move down 1px when pressed. Popup triggers skip the press so their menu does not jump. The `loading` prop swaps the icon for a spinner, keeps focus and sets `aria-busy`.

### Input and Textarea
**Role:** Text entry.

The input is 40px tall with a 1px `--input` border and 12px padding. Focus changes the border to 2px blue and shrinks the padding by 1px so the text stays in place. An invalid field turns the border red.

### Badge
**Role:** Status and visibility labels.

24px tall, 13px weight 500, 8px padding. Variants: `outline` (ink border), `solid` (ink fill), `primary` (blue fill) and `muted` (hairline border).

### Segmented control
**Role:** Single choice from a few options, such as Private, Unlisted and Public.

A radio group on a `--muted` track with 3px padding. The checked option sits on `--background` with weight 500.

### Tabs
**Role:** Switching views.

32px tall text tabs in `--muted-foreground`. The active tab gains a 1px border and the `--background` fill.

### Dropdown menu
**Role:** Actions and the account menu.

Minimum width 192px with 4px vertical padding. Rows are 32px tall with 12px padding and a 16px icon in `--muted-foreground`. The highlighted row uses `bg-muted`. Checkable items use a 16px square box that fills with the foreground color. Labels are 12px in `--muted-foreground`.

### Dialog and alert dialog
**Role:** Focused tasks and confirmations.

Centered, at most 448px wide, with 24px padding, a 16px gap, the 4px offset shadow and a 20px heading-font title. Content scales in from 0.98.

### Sheet
**Role:** The mobile sidebar.

288px wide and at most 85vw. It slides in from the edge in 200ms.

### Checkbox and Switch
**Role:** Boolean choices.

The checkbox is 16px with a 1px border and fills blue when checked. The switch is 30px by 18px with a square 14px thumb and fills blue when on.

### Kbd
**Role:** Shortcut hints.

20px tall, mono 11px, on `--muted`. Inside a button it becomes a translucent white chip.

### Toast
**Role:** Confirmations and undo.

At most 384px wide, 13px text, a leading check or alert icon, an optional text action in the link color and a dismiss button. Errors use a red-tinted border.

### Tooltip
**Role:** Names for icon-only controls.

Mono 12px on an inverted fill with 8px by 4px padding.

### App shell
**Role:** Navigation frame for every signed-in screen.

A resizable sidebar beside a content area. The sidebar holds Starred, Pastes and Collections as collapsible sections, with Shared with me and Trash in a "More" menu below the Dashboard link. Dragging below 200px collapses it, like the header button does. Its width and folded sections persist in the `sidebar` cookie, so the server renders it without a jump. Below 1024px the sidebar becomes a sheet and a bottom tab bar appears, with the new-paste action as a 48px by 40px blue block.

### Paste side panel
**Role:** Settings and history next to a paste.

A stack of single-line rows (Sharing, Access, Views and Revisions on a paste, and Visibility, Expires, Custom link, Collection and Protection on a new paste). A row shows only its label and a chevron until it opens.

### Logo
**Role:** Brand mark.

Six horizontal stripes that taper from a hairline at the top to a full bar at the bottom. Blue `#2A26EC` on light surfaces and white on dark ones. The wordmark is uppercase, `#0A0A0A` on light and white on dark. Both live in `LogoMark` and `Logo`.

### Stripes
**Role:** Decorative motif.

The mark repeated as hairlines, ink blocks and a blue accent, used on the sign-in screen and the share-link page.

## Interaction and motion

| Behavior | Value |
| --- | --- |
| Menu open | 100ms, scale from 0.98 |
| Popover and dialog open | 150ms, scale from 0.98 |
| Sheet and toast | 200ms |
| Button press | Raised variants thin the edge to 1px and sink the label 2px in 60ms, then spring back over 200ms with a slight overshoot. Flat variants `translate-y-px` |
| Button hover, raised variants | Lift 1px |
| Hover, neutral controls | `bg-muted` |
| Hover, filled blue controls | `bg-primary/85`, or 8% lighter on raised buttons |
| Focus on buttons | `ring-3 ring-ring/30` |
| Focus on tabs, switches, toast buttons | `ring-2 ring-ring/40` |
| Disabled | 50% opacity, no pointer events |

Floating layers animate from `--transform-origin`. Toast animations switch off under `prefers-reduced-motion`, and new animations do the same. Scrollbars appear on hover through the `scrollbar-subtle` utility.

## Surfaces

| Level | Surface | Purpose |
| --- | --- | --- |
| 0 | `--background` | Page canvas |
| 1 | `--sidebar` | Sidebar and landing hero |
| 2 | `--muted` | Hover, tracks and chips |
| 3 | `--primary` | Filled actions and one blue band on the landing page |

## Elevation

Surfaces separate with a 1px `--border` or a background step and carry no shadow. Floating layers use a 1px `--border` hairline and a hard offset shadow in `--offset-shadow`, and clip their content to the rounded corners. Raised buttons carry a solid edge below them, which is a pressable part of the control rather than an elevation.

| Layer | Shadow |
| --- | --- |
| Dropdown menu, popover | `3px 3px 0 0 var(--offset-shadow)` |
| Dialog, alert dialog | `4px 4px 0 0 var(--offset-shadow)` |
| Toast | `shadow-md` with a plain border |
| Raised button edge | A 3px `--depth` bottom border inside the button, a darker shade of its fill |
| Segmented control thumb | `0 1px 2px rgb(0 0 0 / 0.08)` |
| Tooltip | None, inverted `bg-foreground` fill |

Backdrops use `bg-foreground/20` in light mode and `bg-black/60` in dark mode. The sheet backdrop uses `bg-foreground/30`.

## Imagery

The product shows real screens with realistic data. The landing page has a dark and a light version in Paper. The dark hero is `#0C0B0B` with a horizon of horizontal pixel stripes in blue, followed by product bands, one pink section, one full-bleed blue call to action and a footer with a large wordmark. Stat tiles use a blue fill for the single highlighted figure. Icons are 16px line glyphs in the text color.

## Page structure

The app is a sidebar and a content area, described under App shell. Forms stay at most 560px wide and pages stop at 1440px. The landing page spaces its sections 96 to 120px apart.

## Copy and content rules

These rules apply to the interface, the landing page, the docs, commit messages, pull request text and this file.

1. Write full sentences. A sentence has a subject and a verb and stands on its own.
2. Skip staccato fragments such as "More reliable. Less expensive." Join the ideas into one sentence or keep the stronger one.
3. Skip the "It's X, not Y" construction and its variants, such as "not just X, but Y". State what the thing is.
4. Follow Jakub Krehel's "less is more". Every word, element and decoration earns its place, and anything that does not gets removed.
5. Skip eyebrows, kickers, taglines above headings, extra captions and decorative labels. A heading stands alone.
6. Add no text that the reader does not need. An empty state gets one sentence and an action.
7. Write "Sniptide" in sentence case, never "SnipTide".
8. Use the vocabulary of `docs/positioning.md`: paste, snippet, pattern, link, self-host, agent. Avoid "revolutionary", "seamless", "supercharge" and "AI-powered".
9. State security facts plainly, with no fear language. Jokes belong in empty states and never in errors or security copy.
10. Name what Sniptide does not do when a claim could be read too broadly.

## Writing and typography rules

- Headings use sentence case and state the claim or the reader's question.
- Prose lines run 60 to 68 characters. A stranded word in a large heading gets fixed by rewriting the copy or adjusting the measure, never by shrinking that one element.
- Peers share one type role, size, weight and line height. A longer string or a larger value never resizes a single peer.
- Numbers that line up in columns use tabular numerals.
- JetBrains Mono sets identifiers only: paste slugs, code, paths, commands, shortcuts and tokens. The sentence around an identifier stays in Inter.
- Paragraphs separate with space and carry no first-line indent.
- Body text keeps a comfortable size and line height, and dense layouts get more room instead of smaller text.

## Data and tables

- Numeric columns and their headers align right, and text columns and their headers align left.
- Charts label series directly and skip legends where a label fits.
- Repeated bars share one scale, one label lane, one value lane and a zero baseline, and only the fill length varies.
- Units, periods and the basis of a comparison sit next to the evidence they qualify.
- A caption states what the reader should notice. Material chart data also has a semantic table or a short text alternative.
- Tables use the full width of the content area.

## Accessibility and responsive behavior

- Pages use landmarks, one descriptive `h1`, ordered headings and a skip link.
- Controls are native elements with accessible names and visible focus.
- Text and controls meet WCAG AA, and color never carries meaning alone.
- Grid and flex children set `min-width: 0`. Layouts reflow before text shrinks, and page overflow stays visible so it gets fixed.
- Light and dark keep the same hierarchy and contrast.
- Source order matches reading order.

## Localization

- The app ships in five languages (en, de, es, ja, zh) through next-intl, with messages in `apps/web/messages`.
- Layouts leave room for strings that run longer than the English source.
- Interface text lives in messages with placeholders. A sentence is never assembled from fragments.
- Dates and numbers go through the locale formatters.

## Design reflexes to reject

Do not ship any of these recognizable defaults:

- All-caps or tracked eyebrows, kickers, overlines and decorative numbered section labels.
- Em dashes.
- Decorative gradients, glows, blobs, stripes, textures, glass or ornamental shadows.
- Generic centered hero copy followed by a card grid.
- Repeated metric boxes when one composed relationship would be clearer.
- A badge, pill or rounded capsule for ordinary metadata, chart annotations or editorial labels.
- Cards nested inside cards, or borders used to repair weak hierarchy.
- A dark rounded rectangle around every chart or calculator.
- Arbitrary icon tiles, oversized icons or mixed icon styles.
- Tiny muted prose, arbitrary font sizes, inconsistent peer values or misaligned baselines.
- A narrow table floating inside a wide section, or a wide table compressed into broken words.
- Decorative charts, redundant visualizations, legends that replace direct labels, or color without meaning.
- Repeated full-width bars that do not share a scale or encode a visible difference.
- Identical section silhouettes across unrelated reader questions.
- Repeated recommendation, summary, rationale and conclusion sections that say the same thing.
- Narration about how a page was organized, why a representation was chosen, or how source fields were renamed.
- Visible theme controls, stock imagery, fake screenshots or decorative brand marks.

Avoiding these defaults must not produce a sterile template. Precise hierarchy, excellent typography, clear evidence and strong alignment give a page its character. The landing page's stripe horizon and the `Badge` component are the established exceptions to the stripe and badge items.

## Do's and Don'ts

### Do

- Start from the existing components and the matching Paper page before inventing a layout.
- Use tokens through Tailwind classes, and add a new color, size or spacing value to `globals.css` first.
- Build light and dark together, and check contrast for any new text color on both backgrounds.
- Build the mobile layout in the same change as the desktop layout.
- Use the offset shadow on floating layers only.
- Use `--link` for blue text and `--primary` for blue fills, so dark mode keeps its contrast.
- Add a variant to an existing component when two screens need different looks.
- Remove an element before adding one, and keep information on the surface and avoid nesting cards.

### Don't

- Don't round anything past `rounded-lg`, and don't write pixel radii. Tune `--radius` instead.
- Don't write hex values in components. Use the variables.
- Don't add shadows to cards, rows or inputs.
- Don't use red for anything other than destructive actions and invalid fields.
- Don't use the pink section outside the landing page.
- Don't add eyebrow labels, taglines or decorative copy, as the copy rules describe.

## Agent prompt guide

### Quick color reference

| Role | Light | Dark |
| --- | --- | --- |
| Text | `#1B1919` | `#F4F4F4` |
| Background | `#FFFFFF` | `#121111` |
| Sidebar | `#FAFAFA` | `#0C0B0B` |
| Secondary text | `#6B6B6B` | `#A3A3A3` |
| Border | `#E8E8E8` | `#2F2C2C` |
| Primary fill | `#2A26EC` | `#3A36FF` |
| Link | `#2A26EC` | `#6AA3FF` |

### Example component prompts

1. **Primary button:** Use `<Button>` with the default variant at 32px. It has a blue fill, white 14px weight 500 text, 12px horizontal padding and 6px corners. A 3px darker-blue bottom edge sits inside its 32px, it lifts 1px on hover, and a press thins the edge while the label sinks.
2. **Menu:** Use `DropdownMenu`. Rows are 32px tall with a 16px icon in `--muted-foreground`, the highlighted row uses `bg-muted`, and the panel has a 1px `--border` hairline with a 3px offset shadow in `--offset-shadow`.
3. **Page title:** Set the title in `font-heading` at 30px with 36px line height, weight 700 and `-0.02em` tracking.
4. **Settings row in the side panel:** Use a single line with a 16px icon, a 14px label and a chevron at the far end. The content appears under the label only when the row opens.
