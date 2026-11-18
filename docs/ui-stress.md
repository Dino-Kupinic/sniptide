# Check layouts with edge-case data

Open `/dev/ui-stress/demo/pastes` while running `bun dev`. The bottom control selects
**Demo data / Worst case / Empty / One / 1,284 rows** and **pastes / shared / trash /
collections / editor / invites**. Selection stays in the URL across reloads and list pagination.
The route returns 404 outside development; production static bundles contain no fixture values.
Fixtures enter through the real components’ props. They are not saved to the database.
Use a disposable local database when interacting with these screens: their ordinary server
mutation actions still require a real signed-in account.

## Fixtures and app surfaces

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
