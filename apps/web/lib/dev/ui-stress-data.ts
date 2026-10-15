import type { PendingInvite } from "@/components/paste/invite-people"
import type { EditorInitial } from "@/components/paste/paste-editor"
import { type Collection, HUES, ICONS } from "@/lib/collections/types"
import { initials } from "@/lib/format"
import type { PasteRow, SharedRow, TrashRow } from "@/lib/pastes/rows"
import type { ViewerSummary } from "@/lib/viewer"

export const datasets = ["demo", "worst", "empty", "one", "large"] as const
export type Dataset = (typeof datasets)[number]
export const screens = ["pastes", "shared", "trash", "collections", "editor", "invites"] as const
export type StressScreen = (typeof screens)[number]

const names = [
  "Aleksandra Wiśniewska-Kowalczyk",
  "Christopher Alexander Montgomery III",
  "Jo",
  "J",
  "Đặng Thị Ngọc Hân",
  "王秀英",
  "نور الهدى عبد الرحمن",
  "👩🏽‍💻 Priya",
  "  Sam   Lee ",
  "",
]
const titles = [
  "Benachrichtigungseinstellungen",
  "Platform infrastructure migration — production rollback instructions and customer communication checklist for Oct 2026",
  "J",
  "Đặng Thị Ngọc Hân — cấu hình triển khai",
  "王秀英的生产部署配置",
  "إعدادات الخصوصية والأمان",
  "<script>alert(1)</script> &amp; **bold**",
  "Q3 deployment checklist",
  "Q3 deployment checklist",
  "customer-feedback-from-enterprise-onboarding",
]
const now = Date.UTC(2026, 9, 14, 12)

// Values respect paste title/file (120), collection name (40), username (30), and file count
// (10) limits. Display names/emails can also arrive from OAuth; no storage limit was found.
export function stressData(dataset: Dataset) {
  const worst = dataset !== "demo"
  const length = dataset === "empty" ? 0 : dataset === "one" ? 1 : dataset === "large" ? 1284 : 10
  const rows: SharedRow[] = Array.from({ length }, (_, index) => {
    const name = worst ? (names[index % names.length] ?? "Jo") : "Jane Doe"
    return {
      slug: `ui-stress-${index + 1}`,
      title: worst
        ? (titles[index % titles.length] ?? "Untitled")
        : `Deployment notes ${index + 1}`,
      language: ["typescript", "objective-c", "text", "python"][index % 4] ?? "text",
      visibility: (["public", "unlisted", "private"] as const)[index % 3] ?? "private",
      burnAfterRead: index % 4 === 3,
      views: worst ? ([0, 1, 1284, 1000000, 12345678][index % 5] ?? 0) : 12,
      expiresLabel: index % 4 === 3 ? "after 1 view" : index % 4 === 1 ? "in 1 hour" : "Never",
      expiresSoon: index % 4 === 1,
      expiresAt: index % 4 === 1 ? now + 3600000 : null,
      updatedAt: now - index * 86400000,
      updatedLabel: ["just now", "1 hour ago", "Yesterday", "Oct 1"][index % 4] ?? "Oct 1",
      collection: null,
      starred: index % 2 === 0,
      owner: {
        name,
        username: worst ? `platform-team-${index + 1}` : "jane",
        initials: initials(name),
        tone: "primary",
      },
      canEdit: index % 2 === 0,
      access: index % 2 === 0 ? "edit" : "view",
      sharedAt: now - index * 86400000,
      sharedLabel: index === 0 ? "just now" : "1 week ago",
      unseen: index === 0,
    }
  })
  const pastes: PasteRow[] = rows.map((row) => ({ ...row, owner: null, canEdit: true }))
  const trash: TrashRow[] = rows.map((row, index) => ({
    slug: row.slug,
    title: row.title,
    language: row.language,
    deletedAt: now - index * 86400000,
    deletedLabel: index === 0 ? "Today" : "Oct 1",
    goneLabel: index === 0 ? "tomorrow" : "in 12 days",
    remaining: index === 0 ? 1 / 30 : 12 / 30,
    goneSoon: index === 0,
    bytes: index === 0 ? 1 : 1024 * 1024,
  }))
  const collections: Collection[] = Array.from({ length: Math.min(length, 50) }, (_, index) => ({
    slug: `stress-collection-${index + 1}`,
    name: worst
      ? ([
          "Benachrichtigungseinstellungen",
          "customer-feedback-enterprise-onboarding",
          "J",
          "王秀英",
          "إعدادات الخصوصية",
          "<b> &amp; **notes**",
        ][index % 6] ?? "Untitled")
      : `Project ${index + 1}`,
    icon: ICONS[index % ICONS.length] ?? "square",
    hue: HUES[index % HUES.length] ?? "ink",
    pasteCount: worst ? ([0, 1, 1284, 1000000][index % 4] ?? 0) : 12,
  }))
  const viewer: ViewerSummary = {
    name: worst ? "👩🏽‍💻 Aleksandra Wiśniewska-Kowalczyk" : "Jane Doe",
    email: worst
      ? "bartholomew.fitzgerald@northwind-industries-holdings.example.com"
      : "jane@example.com",
    username: worst ? "platform-infrastructure-team" : "jane",
    image: worst ? "/ui-stress-missing-avatar.png" : null,
    initials: initials(worst ? "👩🏽‍💻 Aleksandra Wiśniewska-Kowalczyk" : "Jane Doe"),
    storageUsedMb: 38.2,
    storageLimitMb: 100,
  }
  const editor: EditorInitial = {
    title: dataset === "empty" ? "" : (pastes[0]?.title ?? "Deployment notes"),
    description: worst
      ? "Migration instructions: https://example.com/workspaces/platform-infrastructure/projects/q3-launch/docs/9f8e7d6c5b4a?tab=comments&filter=unresolved"
      : "Deployment notes for the team.",
    files: Array.from(
      { length: worst && dataset !== "one" && dataset !== "empty" ? 10 : 1 },
      (_, index) => ({
        name: worst
          ? `platform-infrastructure.production.customer-notification-preferences.rollback-instructions.v${index + 1}.ts`
          : "deploy.ts",
        content:
          dataset === "empty"
            ? ""
            : `// Đặng Thị Ngọc Hân · 王秀英 · 👩🏽‍💻 Priya\nexport const documentation = "https://example.com/workspaces/platform-infrastructure/projects/q3-launch/docs/9f8e7d6c5b4a?tab=comments&filter=unresolved"\n`,
      }),
    ),
    visibility: "private",
    expiry: "never",
    slug: "",
    collection: null,
    hasPassword: false,
    burnAfterRead: false,
  }
  const invites: PendingInvite[] = rows.slice(0, 10).map((row, index) => ({
    person: {
      id: row.slug,
      name: row.owner?.name ?? "",
      initials: row.owner?.initials ?? "?",
      handle: index === 0 && worst ? viewer.email : `@${row.owner?.username}`,
    },
    access: row.access,
  }))
  return { rows, pastes, trash, collections, viewer, editor, invites }
}
