// Shapes the folder screens read, built from the folder table in ./store.ts.

export interface Folder {
  id: string
  // null for a top-level folder.
  parentId: string | null
  name: string
  // Pastes filed directly in it, not counting the trash or subfolders.
  pasteCount: number
}

// What to do with a folder's contents when the folder is deleted. There is deliberately no
// default: a caller has to pick, so a delete never decides for the person.
//  - "move": subfolders and pastes move up into the deleted folder's parent (the top level when it
//    had none).
//  - "trash": its pastes, and those of every subfolder, go to the trash, where they stay for
//    TRASH_DAYS and can be restored (to the top level, as their folders are gone).
export const DELETE_CONTENTS = ["move", "trash"] as const
export type DeleteContents = (typeof DELETE_CONTENTS)[number]

export const MAX_FOLDERS = 500
// Levels of nesting, counting a top-level folder as one.
export const MAX_FOLDER_DEPTH = 8
export const MAX_FOLDER_NAME_LENGTH = 60
// Pastes that can be moved in one call.
export const MAX_MOVE_PASTES = 100
