// Every sentence the extension shows, in one place. Success messages are short past-tense phrases
// without a closing period, and errors say what failed and what to do, as the app's toasts do.

export const messages = {
  // Context menu, shortcut and the toast in the page
  menuSaveSelection: "Save selection to Sniptide",
  saving: "Saving to Sniptide",
  saved: "Saved to Sniptide",
  linkCopied: "Link copied",
  movedToTrash: "Moved to trash",
  undo: "Undo",
  open: "Open",
  dismiss: "Dismiss",
  nothingSelected: "Nothing is selected. Select some text and try again.",
  signInFirst: "You're signed out. Select the Sniptide button in the toolbar to sign in.",

  // Errors
  signInCancelled: "Sign-in was closed before it finished. Try again.",
  unreachable: "Can't reach Sniptide. Check your connection and try again.",
  readOnly: "This connection is read-only. Sign out and sign in again to save pastes.",
  unexpected: "Something went wrong. Try again.",
  expiryNotSet: "The paste was saved, but its expiry wasn't set. Set it in Sniptide.",
  copyFailed: "Couldn't copy. Allow clipboard access and try again.",
  permissionDenied: "Chrome needs your permission to reach that address. Try again and allow it.",

  // Sign-in
  signInTitle: "Save what you find",
  signInBody:
    "Select code or text on any page and save it as a paste. The link is copied for you to share.",
  signIn: "Sign in to Sniptide",
  signingIn: "Waiting for sign-in",
  selfHosted: "Use a self-hosted instance",
  useHosted: "Use app.sniptide.com",
  instanceLabel: "Instance address",
  instancePlaceholder: "sniptide.example.com",

  // Composer
  tabNew: "New paste",
  tabRecent: "Recent",
  contentLabel: "Content",
  contentPlaceholder: "Paste or type what you want to save",
  fileNameLabel: "File name",
  titleLabel: "Title",
  titlePlaceholder: "Name this paste",
  visibilityLabel: "Visibility",
  private: "Private",
  unlisted: "Unlisted",
  public: "Public",
  collectionLabel: "Collection",
  noCollection: "No collection",
  expiresLabel: "Expires",
  save: "Save and copy link",
  codeOnPage: "Code on this page",
  lines: (count: number) => (count === 1 ? "1 line" : `${count} lines`),
  fromSelection: "From your selection",

  // After saving
  savedTitle: "Link copied",
  savedTitleNoCopy: "Saved to Sniptide",
  copyLink: "Copy link",
  copied: "Link copied",
  openPaste: "Open in Sniptide",
  another: "New paste",

  // Recent
  searchPlaceholder: "Search your pastes",
  noPastes: "Nothing saved yet. Select text on a page and save it from the context menu.",
  noMatches: "No paste matches that search.",
  openInNewTab: (title: string) => `Open “${title}” in a new tab`,
  copyLinkTo: (title: string) => `Copy the link to “${title}”`,

  // Settings
  settings: "Settings",
  back: "Back",
  openApp: "Open Sniptide",
  signedInAs: "Signed in as",
  signOut: "Sign out",
  defaultVisibility: "Visibility for quick saves",
  includeSource: "Add the page's address to the description",
  shortcut: "Shortcut for saving the selection",
  shortcutUnset: "Not set",
  changeShortcut: "Change",
} as const

export const expiryLabels = {
  never: "Never",
  "1h": "1 hour",
  "1d": "1 day",
  "1w": "1 week",
  "1m": "1 month",
  "1y": "1 year",
} as const
