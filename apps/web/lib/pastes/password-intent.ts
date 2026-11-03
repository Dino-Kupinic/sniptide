// What a save does to a paste's password. The editor sends it as one `password` field with three
// meanings, kept as a string so saved drafts and API clients stay readable:
//
//   ""        keep the current password (the field is on but nothing new was typed)
//   null      no password: remove it, or never set one
//   "secret"  set this new password
//
// Read and write the field only through these helpers, so the client and the server can't drift.
export type PasswordField = string | null

export type PasswordIntent =
  | { kind: "keep" }
  | { kind: "remove" }
  | { kind: "set"; password: string }

export function passwordIntent(field: PasswordField): PasswordIntent {
  if (field === null) return { kind: "remove" }
  if (field === "") return { kind: "keep" }
  return { kind: "set", password: field }
}

export function passwordField(intent: PasswordIntent): PasswordField {
  return intent.kind === "remove" ? null : intent.kind === "keep" ? "" : intent.password
}

// The field for a paste as it is stored: keep its password, or say it has none.
export function storedPasswordField(hasPassword: boolean): PasswordField {
  return passwordField(hasPassword ? { kind: "keep" } : { kind: "remove" })
}
