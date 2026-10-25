// The iframe code the Share dialog hands out for /<slug>/embed. Its height fits the first file up
// to MAX_LINES, and the embed scrolls past that, so a long paste doesn't take over the host page.
const MAX_LINES = 20
const LINE_HEIGHT = 22
// Header bar, the code's vertical padding and the 1px border on each side.
const CHROME = 44 + 32 + 2
const TAB_ROW = 44

export function embedHeight(lines: number, files: number) {
  const shown = Math.min(Math.max(lines, 1), MAX_LINES)
  return CHROME + (files > 1 ? TAB_ROW : 0) + shown * LINE_HEIGHT
}

export function embedCode(url: string, title: string, lines: number, files: number) {
  const attribute = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")
  return `<iframe src="${attribute(`${url}/embed`)}" title="${attribute(title)}" width="100%" height="${embedHeight(lines, files)}" style="border:0;border-radius:6px" loading="lazy" allow="clipboard-write"></iframe>`
}
