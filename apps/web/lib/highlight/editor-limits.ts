export const EDITOR_MAX_LINES = 1500
export const EDITOR_MAX_LENGTH = 120_000

export function editorLineCount(content: string, limit = Number.POSITIVE_INFINITY) {
  let lines = 1
  for (let index = content.indexOf("\n"); index !== -1; index = content.indexOf("\n", index + 1)) {
    if (++lines > limit) break
  }
  return lines
}

export function isLargeEditorContent(content: string, lines?: number) {
  return (
    content.length > EDITOR_MAX_LENGTH ||
    (lines ?? editorLineCount(content, EDITOR_MAX_LINES)) > EDITOR_MAX_LINES
  )
}
