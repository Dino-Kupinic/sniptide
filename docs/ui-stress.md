# UI stress test — WRK-257

Open `/dev/ui-stress/demo/pastes` while running `bun dev`. The bottom control selects
**Demo data / Worst case / Empty / One / 1,284 rows** and **pastes / shared / trash /
collections / editor / invites**. Selection stays in the URL across reloads and list pagination.
The route returns 404 outside development; production static bundles contain no fixture values.
Fixtures enter through the real components’ props. They are not saved to the database.
Use a disposable local database when interacting with these screens: their ordinary server
mutation actions still require a real signed-in account.

## Surface and limits

| Rendered value | Source | Type / limit | Optional? |
| --- | --- | --- | --- |
| Paste title, row action labels, title tooltip | `PasteRow.title`, `SharedRow.title`, `TrashRow.title`, `EditorInitial.title` | string, 120 (`lib/pastes/schema.ts`) | No; empty editor draft is allowed |
| Editor description | `EditorInitial.description` | string, 280 (`lib/pastes/schema.ts`) | Empty string allowed |
| File tab names, rename input, file contents | `EditorInitial.files` → `EditorFile` | name 120; 1–10 files; aggregate content 1 MB by default (`lib/pastes/schema.ts`) | No; empty draft content allowed |
| Language label and square marker | row language / detected file extension → `languages` | supported language catalog; unknown language falls back to plain text | No |
| Share URL and secondary metadata | instance host + row slug + optional owner username | host: configurable URL, no display limit; custom slug: 40; username: 30 | Owner can be null |
| Visibility badge, burn label | row visibility + burn flag | public / unlisted / private; burn boolean | No |
| Views, header counts, pagination totals and range | rows, page info, collection counts, sidebar counts | nonnegative integers; no presentation width limit | No |
| Pagination controls, page count | page info / `usePaged` | 10 displayed rows per page; page input capped at 1,000,000 | Hidden for ≤1 page |
| Relative dates, expiry highlighting | row updated/shared/deleted/expiry labels | server-computed strings; timestamps in milliseconds | Expiry can be null (“Never”) |
| Trash lifetime meter, warning, size | `TrashRow.remaining`, `goneSoon`, bytes + size label | remaining 0–1; boolean; nonnegative bytes | No |
| Collection title, filter/menu labels, icon, count | `Collection` | name 40, slug 40; enumerated icon/hue; ≤50 collections (`lib/collections/types.ts`) | Empty list allowed |
| Shared owner name and avatar, person filters | `row.owner` → `Person` | name ≤60 via settings; OAuth/database names unbounded; username ≤30 | Owner/name may be absent |
| Invite name, handle, avatar, access label, remove label | `PendingInvite` → share person | handle is username or email; email storage unbounded; view/edit access | Missing name uses handle |
| Invite input, lookup errors | component state + server result | no input display limit; variable error string | Error shown only on failure |
| Account name, email, image, initials, storage meter | `ViewerSummary` | settings name 60, OAuth/email/image URL storage unbounded; numeric storage values | Username/image can be null |
| Recent and starred sidebar rows, per-row menus | `SidebarData` | recent 8, starred 3; same paste title limits | Lists can be empty |
| Search text, filter selections, sort label, grid/list state | list query + component state | server list search capped at 120; filter arrays capped at 50; enumerated sort/view | Empty query allowed |
| Editor title/description inputs, preview toggle, file count, cursor, byte size, side-panel labels | editor state | same paste limits; integer cursor; static option labels | Password/collection/invites optional |
| Buttons, menus, notifications, navigation and skeleton/empty copy | component-defined labels and state | static English strings; dynamic names follow the limits above | Context-dependent |

The fixture validity test checks every title, username, collection and editor input against these
contracts. Test values include short/one-letter names, suffixes, repeated spaces, decomposed
accents, CJK, Arabic and ZWJ emoji; long realistic URLs and filenames; literal markup; duplicate
titles; missing names/images; every visibility and access state; 0, 1, 1,284 and million-scale
counts; and 50 collections. Invalid NaN/null counts are not part of the typed data contract.

## What broke and how it was fixed

Locations below are relative to `apps/web/`.

| # | Severity | Field / worst case | Failure | Fix location |
| --- | --- | --- | --- | --- |
| 1 | Broken | Collection heading `Benachrichtigungseinstellungen` at 320px | Page grew to 575px wide | Let heading shrink and wrap; preserve count width: `components/lists/toolbar.tsx:342` |
| 2 | Broken | Paste/shared tables at 1024px with sidebar | Title links had only 40–44px available | Keep a 960px table inside the existing horizontal scroll area: `components/lists/paste-list.tsx:233`, `shared-list.tsx:250`, `trash-list.tsx:166` |
| 3 | Broken | Owner `Christopher Alexander Montgomery III` | Name painted over the access badge | Constrain the text column, wrap the name, top-align the fixed avatar: `components/lists/shared-list.tsx:290` |
| 4 | Broken | Grid title `Benachrichtigungseinstellungen`; long instance URL | Title collided with menu; URL crossed card boundaries | Two-line title preview with tooltip, wrapping URLs, fixed menu size, two columns at narrow desktop widths: `components/lists/paste-list.tsx:200`, `shared-list.tsx:214`, `row-menu.tsx:39` |
| 5 | Broken | Editor/list controls at 32px root font size | Sort/save actions ran outside the page; fixed top bar and editor metadata crowded content | Wrap control groups, allow header height to grow and metadata to reflow: `components/shell/top-bar.tsx:49`, `components/paste/paste-editor.tsx:452`, `components/lists/paste-list.tsx:164` |
| 6 | Broken | Mobile account controls at 32px root font size | Logo and fixed account/search controls expanded page to 374px | Let wordmark yield and retain fixed controls: `components/shell/mobile-top-bar.tsx:22` |
| 10 | Broken | Touch-only device at desktop width | Sidebar action buttons remained at zero opacity with no hover gesture | Always reveal controls when hover is unavailable: `components/shell/sidebar.tsx:63` |
| 7 | Ugly | `👩🏽‍💻 Priya`, combining accents, `Christopher … III` | Broken surrogate glyphs; suffix produced CI instead of CM | Segment complete graphemes and skip generational suffixes: `lib/format.ts:71` |
| 8 | Ugly | Exactly 1 view; 1,284-row totals | “1 views”; unformatted totals | Singular label and shared number formatter: `components/lists/paste-list.tsx:225`, `toolbar.tsx:346`, `shared-list.tsx:354`, `trash-list.tsx:266` |
| 9 | Fragile | Missing invite display name; truncated collection/account labels | Blank person row; full identifying values unavailable on hover | Fallback to handle and expose full values in titles: `components/paste/invite-people.tsx:59`, `components/collections/collections-view.tsx:58`, `components/shell/account-menu.tsx:56` |

Pagination’s crowded mobile width was also inferred from its fixed button budget. It now shows
previous/current/next on small screens and retains full page choices on larger screens; footer
content wraps (`components/lists/toolbar.tsx:266`). With 1,284 rows, next/previous navigation was
verified in all three paginated lists. Collection counts move below their names on phones, which
also keeps million-scale totals and menus readable under large text.

## Decisions applied

- Wrap collection page headings and shared-owner names so their full identity remains readable.
- Clamp grid previews to two lines and expose the complete title in a tooltip/detail link.
- Keep table columns readable with horizontal scrolling at narrow desktop widths.
- Keep existing pagination rather than introducing virtualization: only ten paste rows render.
- Keep the app’s existing English number-format convention. This change does not introduce localization.

## What held up

Empty lists and no-results messaging already existed; one-item collections already used “paste”.
Mobile text columns and language markers already had safe flex sizing. Visibility/access badges,
all ten editor files, long filenames in the horizontally scrollable tab bar, disabled permissions,
literal markup, and missing-image avatar fallbacks remained usable. The sidebar already bounds
recent/starred items and scrolls long collection sections without losing the account menu.

## Verification

- 240 combinations: six screens × five datasets × four widths (320, 1024, 1280, 2560) × normal/32px root font. No document overflow, invalid Unicode replacement glyphs, browser page errors, or lists rendering more than ten table rows.
- Additional touch-only desktop checks (sidebar action opacity 0 before, 1 after); grid/card checks; dark theme and RTL content at 320/1280px; next/previous pagination for all large lists.
- RTL was applied to the content area, since the app does not advertise a fully mirrored shell. The scope is layout/data resilience, not a complete accessibility or performance audit.
- Production build, type checking, lint and Biome checks passed. Existing build warning: missing fallback-font metrics for Stack Sans Notch.
- 350 web tests passed with an isolated PostgreSQL database, including new grapheme/suffix and fixture-contract tests.
- Existing seven browser tests passed against the production build, including a real create/open/menu flow for the long collection name. An additional browser regression checks production’s 404 guard.

Local screenshot evidence from the run is under `/private/tmp/sniptide-ui-evidence/`, with before,
after and final folders. `final/results.json` records the matrix measurements. These generated
screenshots are not shipped with the app.
