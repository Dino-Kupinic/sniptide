"use client"

import { Button } from "@sniptide/ui/components/button"
import { FormError } from "@sniptide/ui/components/form-error"
import { SegmentedControl } from "@sniptide/ui/components/segmented-control"
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetHeader,
} from "@sniptide/ui/components/sheet"
import { toast } from "@sniptide/ui/components/toast"
import { cn } from "@sniptide/ui/lib/utils"
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronUpIcon,
  EyeIcon,
  FolderIcon,
  LinkIcon,
  LockIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import * as React from "react"
import { AutosaveStatus, ConflictBanner, DraftNotice } from "@/components/autosave-status"
import { CodeBlock } from "@/components/paste/code-block"
import {
  CollectionSelect,
  ExpiryChips,
  expiryOptions,
  PasswordInput,
  SlugInput,
  ToggleRow,
  useSlugStatus,
  visibilityOptions,
} from "@/components/paste/editor-options"
import { type EditorFile, FileTabs } from "@/components/paste/file-tabs"
import { HighlightedTextarea } from "@/components/paste/highlighted-textarea"
import { InvitePeople, type PendingInvite } from "@/components/paste/invite-people"
import { LanguageIcon } from "@/components/paste/language-icon"
import { LanguagePicker } from "@/components/paste/language-picker"
import {
  type PanelSection,
  SidePanel,
  SidePanelProvider,
  SidePanelToggle,
} from "@/components/paste/side-panel"
import { useEditorHistory } from "@/components/paste/use-editor-history"
import { HeaderActions, HeaderTitle } from "@/components/shell/page-header"
import { ShortcutKeys } from "@/components/shortcuts/shortcut-keys"
import { useSiteHost } from "@/components/site-host"
import { showUndo } from "@/components/undo-toast"
import { track } from "@/lib/analytics"
import type { Autosaver, SaveOutcome } from "@/lib/autosave/autosaver"
import { draftKey } from "@/lib/autosave/drafts"
import {
  type PasteBroadcast,
  useAutosave,
  useDraftBackup,
  useSaveBroadcast,
} from "@/lib/autosave/use-autosave"
import type { Collection } from "@/lib/collections/types"
import { editKind, type Snapshot } from "@/lib/editor-history"
import { byteLength, formatBytes, formatDateTime } from "@/lib/format"
import { useHighlight } from "@/lib/highlight/use-highlight"
import type { Locale } from "@/lib/i18n/config"
import { isOverlayOpen } from "@/lib/keyboard"
import { autosavePaste, finishEditing, type SavePasteInput, savePaste } from "@/lib/pastes/actions"
import { detectLanguage, getLanguage, renameForLanguage } from "@/lib/pastes/languages"
import type { Expiry, Visibility } from "@/lib/pastes/types"
import { indentUnit, type Preferences } from "@/lib/preferences"
import { findSecrets } from "@/lib/secrets"
import { matchesCombo, shortcut } from "@/lib/shortcuts"

export interface EditorInitial {
  title: string
  description: string
  files: { name: string; content: string }[]
  visibility: Visibility
  expiry: Expiry | "keep"
  slug: string
  collection: string | null
  hasPassword: boolean
  burnAfterRead: boolean
  // The paste's version when the page loaded (editing only); see autosavePaste.
  version?: number
}

const SLUG_PATTERN = /^[A-Za-z0-9_-]{3,40}$/

// What the draft on this device keeps: everything except the password, which never leaves memory.
function forDraft(value: SavePasteInput): SavePasteInput {
  return { ...value, password: value.password === null ? null : "" }
}

// Why an edit can't be saved yet, or null. Mirrors the first checks the server makes, so the
// editor says "add a title" quietly instead of showing an error while someone is mid-thought.
function unsavable(value: SavePasteInput) {
  if (!value.title.trim()) return "addATitle"
  if (value.files.some((file) => !file.name.trim())) return "everyFileNeedsAName"
  if (new Set(value.files.map((file) => file.name.trim())).size !== value.files.length) {
    return "fileNamesMustBeUnique"
  }
  if (!value.files.some((file) => file.content.trim())) return "pasteSomeCode"
  return null
}

function snapshotOf(textarea: HTMLTextAreaElement): Snapshot {
  return {
    value: textarea.value,
    selectionStart: textarea.selectionStart,
    selectionEnd: textarea.selectionEnd,
  }
}

// Whether the on-screen keyboard is up while a field has focus. The keyboard shrinks the visual
// viewport (and on some browsers the layout viewport too), so this compares the visible height
// with the tallest one seen at this width.
function useSoftKeyboard() {
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    let width = window.innerWidth
    let tallest = Math.max(window.innerHeight, viewport.height)
    function check() {
      if (!viewport) return
      if (window.innerWidth !== width) {
        width = window.innerWidth
        tallest = 0
      }
      tallest = Math.max(tallest, window.innerHeight, viewport.height)
      const field = document.activeElement
      const typing =
        field instanceof HTMLTextAreaElement ||
        (field instanceof HTMLInputElement && !["checkbox", "radio"].includes(field.type)) ||
        (field instanceof HTMLElement && field.isContentEditable)
      setOpen(typing && viewport.height < tallest - 120)
    }
    viewport.addEventListener("resize", check)
    document.addEventListener("focusin", check)
    document.addEventListener("focusout", check)
    return () => {
      viewport.removeEventListener("resize", check)
      document.removeEventListener("focusin", check)
      document.removeEventListener("focusout", check)
    }
  }, [])
  return open
}

// Grows a one-row textarea with its text, so a long title wraps instead of being cut off.
function useAutoHeight(value: string) {
  const ref = React.useRef<HTMLTextAreaElement>(null)
  React.useLayoutEffect(() => {
    const field = ref.current
    if (!field) return
    field.style.height = "auto"
    field.style.height = `${field.scrollHeight}px`
  }, [value])
  React.useEffect(() => {
    const field = ref.current
    if (!field) return
    const observer = new ResizeObserver(() => {
      field.style.height = "auto"
      field.style.height = `${field.scrollHeight}px`
    })
    observer.observe(field.parentElement ?? field)
    return () => observer.disconnect()
  }, [])
  return ref
}

let fileCounter = 0
function newFile(name: string, content = ""): EditorFile {
  fileCounter += 1
  return { id: `file-${fileCounter}`, name, content }
}

export function PasteEditor({
  initial,
  editing,
  currentExpiresAt,
  collections,
  draftScope,
  indentation = "2",
  lineNumbers = true,
  secretDetection = true,
  notice,
  sharedEdit,
}: {
  initial: EditorInitial
  // Slug of the paste being edited; omitted for a new paste.
  editing?: string
  // Human label for the current expiry when editing ("Oct 12, 09:24").
  currentExpiresAt?: number | null
  collections: Collection[]
  // Whose drafts these are (the signed-in account, plus what the page started from), so accounts
  // sharing a browser and different starting points don't mix.
  draftScope: string
  // From the viewer's Settings: what Tab inserts, whether lines are numbered, and whether to warn
  // about pasted secrets.
  indentation?: Preferences["indentation"]
  lineNumbers?: boolean
  secretDetection?: boolean
  // Shown like a save error when the page couldn't prefill the editor (a gist that can't be read).
  notice?: string
  // Editing a paste someone shared with the viewer: only its title, description and files are
  // theirs to change, so the sharing options stay hidden.
  sharedEdit?: boolean
}) {
  const t = useTranslations("Paste")
  const feedbackT = useTranslations("Core")
  const locale: Locale = useLocale()
  const host = useSiteHost()
  const router = useRouter()
  const [title, setTitle] = React.useState(initial.title)
  const [description, setDescription] = React.useState(initial.description)
  const [files, setFiles] = React.useState<EditorFile[]>(() =>
    initial.files.map((file) => newFile(file.name, file.content)),
  )
  const [activeId, setActiveId] = React.useState(() => files[0]?.id ?? "")
  const [preview, setPreview] = React.useState(false)
  const [visibility, setVisibility] = React.useState(initial.visibility)
  const [expiry, setExpiry] = React.useState(initial.expiry)
  const [slug, setSlug] = React.useState(initial.slug)
  const [collection, setCollection] = React.useState(initial.collection)
  const [passwordOn, setPasswordOn] = React.useState(initial.hasPassword)
  const [password, setPassword] = React.useState("")
  const [burnAfterRead, setBurnAfterRead] = React.useState(initial.burnAfterRead)
  const [invites, setInvites] = React.useState<PendingInvite[]>([])
  const [cursor, setCursor] = React.useState({ line: 1, column: 1 })
  const [error, setError] = React.useState<string | null>(notice ?? null)
  const [pending, startTransition] = React.useTransition()
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [languageOpen, setLanguageOpen] = React.useState(false)
  const keyboardUp = useSoftKeyboard()
  const titleRef = useAutoHeight(title)
  const formRef = React.useRef<HTMLFormElement>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)
  // Where the caret goes once the next render has put new text in the textarea (Undo, Redo, Tab).
  const pendingSelection = React.useRef<Pick<Snapshot, "selectionStart" | "selectionEnd"> | null>(
    null,
  )
  const removalToasts = React.useRef(new Set<number>())
  const history = useEditorHistory()
  const formId = React.useId()
  // Editing a paste saves it as you go, so the fields below are split in two. What the person is
  // typing lives in the state above. A custom link and a password only count once they finish
  // typing (leave the field or press Enter), because saving "ab" on the way to "abc" would change
  // the paste's public link or lock it behind a half-typed password.
  const [committedSlug, setCommittedSlug] = React.useState(initial.slug)
  const [committedPassword, setCommittedPassword] = React.useState("")
  // What the server has: the link the page is at, whether a password is set, and when it expires.
  const [savedSlug, setSavedSlug] = React.useState(editing ?? "")
  const [hasPassword, setHasPassword] = React.useState(initial.hasPassword)
  const [savedExpiresAt, setSavedExpiresAt] = React.useState(currentExpiresAt)
  const expiryLabel =
    savedExpiresAt === undefined
      ? undefined
      : savedExpiresAt === null
        ? t("neverExpires")
        : t("expiresAt", { date: formatDateTime(savedExpiresAt, locale) })
  const versionRef = React.useRef(initial.version ?? 0)
  const slugStatus = useSlugStatus(slug, editing ? savedSlug : undefined)

  const active = files.find((file) => file.id === activeId) ?? files[0]
  const language = detectLanguage(active?.name ?? "")
  const totalBytes = files.reduce((size, file) => size + byteLength(file.content), 0)
  const lineCount = (active?.content ?? "").split("\n").length
  const lines = useHighlight(active?.content ?? "", active?.name ?? "")
  // The code view drops one trailing newline; the textarea shows it as an empty last line.
  const previewLines = active?.content.endsWith("\n") ? lines?.slice(0, -1) : lines
  const secret = React.useMemo(
    () => (secretDetection ? findSecrets(files) : null),
    [files, secretDetection],
  )

  // The paste as the server would store it. Editing sends this after every pause in typing.
  const slugForSave = !editing
    ? slug
    : committedSlug === slug && slugStatus === "ok" && SLUG_PATTERN.test(slug)
      ? slug
      : savedSlug
  const passwordForSave = !passwordOn
    ? null
    : !editing
      ? password
      : // Switched on but not set yet: the paste isn't protected until a password is typed.
        committedPassword || (hasPassword ? "" : null)
  const value = React.useMemo<SavePasteInput>(
    () => ({
      title,
      description,
      files: files.map(({ name, content }) => ({ name, content })),
      visibility,
      expiry,
      slug: slugForSave,
      collection,
      password: passwordForSave,
      burnAfterRead,
    }),
    [
      title,
      description,
      files,
      visibility,
      expiry,
      slugForSave,
      collection,
      passwordForSave,
      burnAfterRead,
    ],
  )
  const [initialValue] = React.useState<SavePasteInput>(() => ({
    title: initial.title,
    description: initial.description,
    files: initial.files.map(({ name, content }) => ({ name, content })),
    visibility: initial.visibility,
    expiry: initial.expiry,
    slug: initial.slug,
    collection: initial.collection,
    password: initial.hasPassword ? "" : null,
    burnAfterRead: initial.burnAfterRead,
  }))

  // The newest version another tab or device saved, once we know about it.
  const conflictRef = React.useRef<PasteBroadcast | null>(null)
  const savedSlugRef = React.useRef(editing ?? "")
  const autosaverRef = React.useRef<Autosaver<SavePasteInput> | null>(null)
  const [changedElsewhere, setChangedElsewhere] = React.useState(false)
  const draftId = draftKey(draftScope, editing)
  const broadcast = useSaveBroadcast(draftId, (message) => {
    if (message.version === versionRef.current) return
    conflictRef.current = message
    if (autosaverRef.current?.hasUnsavedChanges()) autosaverRef.current.markConflict()
    else setChangedElsewhere(true)
  })

  async function saveEdit(sent: SavePasteInput): Promise<SaveOutcome<SavePasteInput>> {
    const result = await autosavePaste(savedSlugRef.current, sent, versionRef.current)
    if (!result.ok) {
      if ("conflict" in result) {
        conflictRef.current = { slug: result.slug, version: result.version }
        return { ok: false, conflict: true }
      }
      return result
    }

    versionRef.current = result.version
    savedSlugRef.current = result.slug
    broadcast({ slug: result.slug, version: result.version })
    setSavedSlug(result.slug)
    setHasPassword(result.hasPassword)
    setSavedExpiresAt(result.expiresAt)
    // An expiry picked from the chips is relative to the save, so it must not be applied again by
    // the next one. A password was hashed on the server; the field goes back to "keep".
    setExpiry((current) => (current === sent.expiry ? "keep" : current))
    if (sent.password) {
      setPassword((current) => (current === sent.password ? "" : current))
      setCommittedPassword((current) => (current === sent.password ? "" : current))
    }
    return {
      ok: true,
      saved: {
        ...sent,
        expiry: "keep",
        slug: result.slug,
        password: result.hasPassword ? "" : null,
      },
    }
  }

  const { autosaver, state } = useAutosave({
    value,
    initial: initialValue,
    save: saveEdit,
    validate: (next) => {
      const reason = unsavable(next)
      return reason ? t(reason) : null
    },
    manual: !editing,
  })
  autosaverRef.current = autosaver
  const unsaved = state.kind !== "idle" && state.kind !== "saved"

  // A backup of unsaved edits on this device, put back if the tab closed or the network dropped
  // before they reached the server.
  const draftValue = React.useMemo(() => forDraft(value), [value])
  const [draftReady, setDraftReady] = React.useState(false)
  const [draftNotice, setDraftNotice] = React.useState<
    { kind: "restored" } | { kind: "choose"; savedAt: number } | null
  >(null)
  const {
    draft,
    discard: discardDraft,
    saveNow: saveDraftNow,
  } = useDraftBackup({
    key: draftId,
    value: draftValue,
    baseVersion: editing ? versionRef.current : null,
    dirty: unsaved,
    enabled: draftReady,
  })
  const latestValue = React.useRef(value)
  latestValue.current = value
  const draftChecked = React.useRef(false)

  function applyValue(next: SavePasteInput) {
    const nextFiles = next.files.map((file) => newFile(file.name, file.content))
    setTitle(next.title)
    setDescription(next.description)
    setFiles(nextFiles)
    setActiveId(nextFiles[0]?.id ?? "")
    setVisibility(next.visibility)
    setExpiry(next.expiry)
    setSlug(next.slug)
    setCommittedSlug(next.slug)
    setCollection(next.collection)
    setPasswordOn(next.password !== null)
    setPassword("")
    setCommittedPassword("")
    setBurnAfterRead(next.burnAfterRead)
  }

  React.useEffect(() => {
    if (draft === undefined || draftChecked.current) return
    draftChecked.current = true
    if (!draft) return setDraftReady(true)

    const started = JSON.stringify(forDraft(initialValue))
    if (JSON.stringify(draft.value) === started) {
      void discardDraft()
      return setDraftReady(true)
    }
    // Typing before the draft arrived, or a draft made against an older version of the paste:
    // let the person pick instead of overwriting either.
    const edited = JSON.stringify(forDraft(latestValue.current)) !== started
    if (edited || (editing && draft.baseVersion !== versionRef.current)) {
      return setDraftNotice({ kind: "choose", savedAt: draft.savedAt })
    }
    applyValue(draft.value)
    setDraftNotice({ kind: "restored" })
    setDraftReady(true)
  }, [draft])

  // Once a restored draft has reached the server there is nothing left to undo.
  React.useEffect(() => {
    if (editing && draftNotice?.kind === "restored" && state.kind === "saved") setDraftNotice(null)
  }, [editing, draftNotice, state])

  // A new custom link moves the page's own address. Do it once everything is saved: the editor
  // starts over at the new address, and anything typed in the meantime comes back from the draft.
  React.useEffect(() => {
    if (!editing || savedSlug === editing || state.kind !== "saved") return
    if (autosaver.hasUnsavedChanges()) return
    React.startTransition(() => {
      router.replace(`/pastes/${savedSlug}/edit`)
      router.refresh()
    })
  }, [editing, savedSlug, state, autosaver, router])

  async function loadLatest() {
    const target = conflictRef.current?.slug ?? savedSlugRef.current
    // Nothing to protect any more, so leaving doesn't ask.
    autosaver.rebase(value)
    await discardDraft()
    window.location.assign(`/pastes/${target}/edit`)
  }

  function keepMine() {
    if (conflictRef.current) versionRef.current = conflictRef.current.version
    setChangedElsewhere(false)
    autosaver.resolveConflict()
  }

  // Editing has no save button: this leaves once the last edit is on the server.
  async function finish() {
    const saved = await autosaver.flush()
    if (!saved && !window.confirm(t("someChangesHavenTBeenSaved"))) {
      return
    }
    // Best effort: failing to close the revision only means the next edit may share it.
    if (saved) await finishEditing(savedSlugRef.current).catch(() => {})
    router.push(`/pastes/${savedSlugRef.current}`)
  }

  function updateActive(patch: Partial<EditorFile>) {
    setFiles((current) =>
      current.map((file) => (file.id === active?.id ? { ...file, ...patch } : file)),
    )
  }

  function addFile() {
    const file = newFile(`untitled-${files.length + 1}.txt`)
    setFiles((current) => [...current, file])
    setActiveId(file.id)
    setPreview(false)
    return file.id
  }

  function removeFile(id: string) {
    if (files.length === 1) return
    const index = files.findIndex((file) => file.id === id)
    const removed = files[index]
    const next = files.filter((file) => file.id !== id)
    setFiles(next)
    if (id === activeId) setActiveId(next[Math.max(0, index - 1)]?.id ?? "")
    if (!removed) return

    // Undo puts the file back where it was, with its content and its undo history.
    const toastId = showUndo({
      labels: { undo: feedbackT("undo"), error: feedbackT("undoError") },
      message: t("removedFile", { name: removed.name }),
      undo: async () => {
        setFiles((current) =>
          current.some((file) => file.id === removed.id)
            ? current
            : [...current.slice(0, index), removed, ...current.slice(index)],
        )
        setActiveId(removed.id)
        setPreview(false)
      },
    })
    removalToasts.current.add(toastId)
  }

  // The toasts above only make sense while the editor is open.
  React.useEffect(() => {
    const toasts = removalToasts.current
    return () => {
      for (const id of toasts) toast.dismiss(id)
    }
  }, [])

  function trackCursor(textarea: HTMLTextAreaElement) {
    const before = textarea.value.slice(0, textarea.selectionStart)
    const lines = before.split("\n")
    setCursor({ line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 })
  }

  // Undo and Redo walk this file's own history (see useEditorHistory), not the browser's, so they
  // keep working after Tab, after switching files and across saves.
  function step(direction: "undo" | "redo") {
    if (!active) return
    const result = history.step(active.id, active.content, direction)
    if (!result) return
    pendingSelection.current = result
    updateActive({ content: result.value })
  }

  // Latest `step` for the native listener below, which is attached once.
  const stepRef = React.useRef(step)
  React.useEffect(() => {
    stepRef.current = step
  })

  // The Edit menu and a phone's shake-to-undo bypass the keyboard: catch them as well.
  const bindTextarea = React.useCallback((textarea: HTMLTextAreaElement | null) => {
    textareaRef.current = textarea
    if (!textarea) return
    function onBeforeInput(event: InputEvent) {
      if (event.inputType !== "historyUndo" && event.inputType !== "historyRedo") return
      event.preventDefault()
      stepRef.current(event.inputType === "historyRedo" ? "redo" : "undo")
    }
    textarea.addEventListener("beforeinput", onBeforeInput)
    return () => {
      textarea.removeEventListener("beforeinput", onBeforeInput)
      textareaRef.current = null
    }
  }, [])

  React.useLayoutEffect(() => {
    const selection = pendingSelection.current
    const textarea = textareaRef.current
    if (!selection || !textarea) return
    pendingSelection.current = null
    textarea.setSelectionRange(selection.selectionStart, selection.selectionEnd)
    trackCursor(textarea)
  })

  function onEditorKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) return

    // ⌘Z / ⌘⇧Z (and Ctrl+Y off the Mac) go through our own history.
    const undo = matchesCombo(event, shortcut("undo").keys)
    const redo =
      matchesCombo(event, shortcut("redo").keys) ||
      (event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === "y")
    if (undo || redo) {
      event.preventDefault()
      step(undo ? "undo" : "redo")
      return
    }

    // Tab indents (by the Settings indentation) instead of leaving the editor.
    const key = event.key.toLowerCase()
    if (key !== "tab" || event.shiftKey || !active) return
    event.preventDefault()
    const textarea = event.currentTarget
    const { selectionStart, selectionEnd, value } = textarea
    const unit = indentUnit(indentation)
    const next = `${value.slice(0, selectionStart)}${unit}${value.slice(selectionEnd)}`
    const caret = selectionStart + unit.length
    history.edit(
      active.id,
      value,
      { value: next, selectionStart: caret, selectionEnd: caret },
      "other",
    )
    pendingSelection.current = { selectionStart: caret, selectionEnd: caret }
    updateActive({ content: next })
  }

  function submit() {
    if (editing) {
      void finish()
      return
    }
    // A second ⌘S or ⌘↵ while the first is still saving must not create the paste twice.
    if (pending) return
    setError(null)
    if (slugStatus === "taken") {
      setError(t("linkTaken", { link: `${host}/${slug}` }))
      return
    }

    startTransition(async () => {
      const result = await savePaste(
        value,
        undefined,
        // Only a new private paste invites people; switching away from Private drops them.
        visibility === "private"
          ? invites.map((invite) => ({ userId: invite.person.id, access: invite.access }))
          : [],
      ).catch(() => null)

      if (!result) {
        setError(t("couldnTSaveThePasteCheck"))
        return
      }
      if (!result.ok) {
        setError(result.error)
        return
      }
      track("paste_created", {
        files: files.length,
        visibility,
        expiry,
        burn_after_read: burnAfterRead,
        password: passwordOn,
        custom_link: Boolean(slug),
        invites: visibility === "private" ? invites.length : 0,
      })
      toast.success(t("pasteCreated"))
      autosaver.rebase(value)
      await discardDraft()
      router.push(`/pastes/${result.slug}`)
    })
  }

  // Latest handlers for the window listener below, which is attached once.
  const saveRef = React.useRef<() => void>(() => {})
  React.useEffect(() => {
    saveRef.current = async () => {
      // An open paste saves as you go, so ⌘S just pushes the pending edit out. A new paste has
      // nowhere to be saved yet, so ⌘S keeps what's typed as a draft on this device.
      if (editing) void autosaver.flush()
      else {
        const result = await saveDraftNow()
        switch (result.kind) {
          case "saved":
            toast.success(t("draftSavedOnThisDevice"))
            break
          case "unavailable":
            toast.error(t("draftSaveUnavailable"))
            break
          case "skipped":
            break
          default: {
            const exhaustive: never = result
            return exhaustive
          }
        }
      }
    }
  })

  React.useEffect(() => {
    // ⌘↵ creates the paste (or finishes editing it); ⌘S saves without leaving. ⌘S is claimed even
    // while something else has focus, since the browser would otherwise offer to save the page.
    function onKeyDown(event: KeyboardEvent) {
      const submits = matchesCombo(event, shortcut("submit").keys)
      const saves = matchesCombo(event, shortcut("save").keys)
      if ((!submits && !saves) || event.defaultPrevented) return
      event.preventDefault()
      // A dialog or menu in front owns the keyboard.
      if (event.repeat || isOverlayOpen()) return
      if (saves) saveRef.current()
      else formRef.current?.requestSubmit()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const cancelHref = editing ? `/pastes/${savedSlug}` : "/pastes"

  // The options, laid out for the desktop side panel or (large) for the mobile settings sheet, in
  // the same order.
  function optionSections(large: boolean): PanelSection[] {
    const passwordField = passwordOn ? (
      <>
        <PasswordInput
          value={password}
          onChange={setPassword}
          onCommit={editing ? () => setCommittedPassword(password) : undefined}
          placeholder={hasPassword ? t("leaveEmptyToKeepTheCurrent") : t("password")}
          large={large}
        />
        {editing && !hasPassword && !committedPassword ? (
          <p className="text-xs text-muted-foreground">{t("anyoneWithTheLinkCanOpenMessage")}</p>
        ) : null}
      </>
    ) : null

    const inviteMenu =
      !editing && visibility === "private" ? (
        <InvitePeople invites={invites} onChange={setInvites} large={large} />
      ) : null

    return [
      {
        id: "access",
        label: t("visibilityExpiry"),
        icon: EyeIcon,
        content: (
          <>
            <SegmentedControl
              aria-label={t("visibility")}
              value={visibility}
              onValueChange={setVisibility}
              options={visibilityOptions.map((option) => ({
                ...option,
                label: t("visibilityValue", { value: option.value }),
              }))}
              itemClassName={large ? "py-2 text-sm" : undefined}
            />
            <p className="text-xs text-muted-foreground">
              {t("visibilityHelp", { value: visibility })}
            </p>
            {inviteMenu ? (
              <div className="mt-1 border-t border-border pt-3">{inviteMenu}</div>
            ) : null}
            <div className="mt-1 flex flex-col gap-2">
              <span className="text-muted-foreground">{t("expiresAfter")}</span>
              <ExpiryChips
                value={expiry}
                onChange={setExpiry}
                options={expiryOptions.map((option) => ({
                  ...option,
                  label: t("expiryValue", { value: option.value }),
                  valueLabel: t("expiryLong", { value: option.value }),
                }))}
                currentExpiry={expiryLabel}
              />
            </div>
          </>
        ),
      },
      {
        id: "slug",
        label: t("customLink"),
        icon: LinkIcon,
        content: (
          <SlugInput
            value={slug}
            onChange={setSlug}
            onCommit={editing ? () => setCommittedSlug(slug) : undefined}
            status={slugStatus}
            large={large}
          />
        ),
      },
      {
        id: "collection",
        label: t("collection"),
        icon: FolderIcon,
        marked: collection !== null,
        content: (
          <CollectionSelect
            value={collection}
            onChange={setCollection}
            collections={collections}
            large={large}
          />
        ),
      },
      {
        id: "protection",
        label: t("protection"),
        icon: LockIcon,
        marked: passwordOn || burnAfterRead,
        content: (
          <>
            <ToggleRow
              label={t("password")}
              description={t("visitorsMustEnterItToView")}
              checked={passwordOn}
              onCheckedChange={setPasswordOn}
              large={large}
            />
            {passwordField}
            <ToggleRow
              label={t("burnAfterReading")}
              description={t("deletedAfterTheFirstView")}
              checked={burnAfterRead}
              onCheckedChange={setBurnAfterRead}
              large={large}
            />
          </>
        ),
      },
    ]
  }

  const panelSections = optionSections(false)
  const heading = editing ? t("editPaste") : t("newPaste")
  // The mobile settings chip names the state: "Unlisted · 1 week".
  const settingsSummary = t("settingsSummary", {
    visibility: t("visibilityValue", { value: visibility }),
    expiry: expiry === "keep" ? (expiryLabel ?? t("keep")) : t("expiryLong", { value: expiry }),
  })

  return (
    <form
      ref={formRef}
      id={formId}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      className="flex min-h-svh flex-col lg:min-h-0 lg:gap-5 lg:p-7"
    >
      {/* Mobile header from the Paper "New paste" artboard */}
      <div className="sticky top-0 z-20 box-content flex h-[52px] items-center gap-1 bg-background pt-[env(safe-area-inset-top)] pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(0.5rem,env(safe-area-inset-left))] lg:hidden">
        {editing ? (
          <Button
            type="button"
            variant="ghost"
            size="xl"
            aria-label={t("backToPaste")}
            onClick={() => void finish()}
            className="w-10 px-0"
          >
            <ChevronLeftIcon className="size-5" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="xl"
            render={<Link href={cancelHref} />}
            nativeButton={false}
            className="px-2"
          >
            {t("cancel")}
          </Button>
        )}
        <h1 className="min-w-0 flex-1 truncate text-center font-heading text-xl leading-7 font-bold tracking-[-0.02em]">
          {heading}
        </h1>
        <Button
          type="button"
          variant="ghost"
          size="xl"
          onClick={() => setPreview((value) => !value)}
          aria-pressed={preview}
          className={cn("px-2 text-muted-foreground", preview && "text-link")}
        >
          {preview ? t("edit") : t("preview")}
        </Button>
      </div>
      <h1 className="sr-only max-lg:hidden">{heading}</h1>

      <HeaderTitle>
        {heading}
        {editing ? <AutosaveStatus state={state} className="hidden lg:inline" /> : null}
      </HeaderTitle>
      <HeaderActions>
        {editing ? null : (
          <Button
            variant="ghost"
            size="lg"
            render={<Link href={cancelHref} />}
            nativeButton={false}
          >
            {t("discard")}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="lg"
          aria-pressed={preview}
          onClick={() => setPreview((value) => !value)}
        >
          <EyeIcon />
          {preview ? t("edit") : t("preview")}
        </Button>
        <Button type="submit" form={formId} size="lg" loading={pending} className="gap-2">
          {editing ? t("done") : pending ? t("saving") : t("createPaste")}
          <ShortcutKeys id="submit" className="bg-primary-foreground/20 text-primary-foreground" />
        </Button>
      </HeaderActions>

      <div className="flex min-w-0 flex-col gap-1.5 px-4 pb-4 lg:p-0">
        <textarea
          ref={titleRef}
          aria-label={t("title")}
          rows={1}
          value={title}
          // A title is one line: Enter moves on to the description and pasted breaks become spaces.
          onChange={(event) => setTitle(event.target.value.replace(/\r?\n/g, " "))}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return
            event.preventDefault()
            event.currentTarget.form?.querySelector<HTMLInputElement>("[data-description]")?.focus()
          }}
          placeholder={t("untitledPaste")}
          maxLength={120}
          required
          className="block w-full resize-none overflow-hidden bg-transparent font-heading text-[30px] leading-9 font-bold tracking-[-0.02em] caret-highlight outline-none placeholder:text-muted-foreground/50 lg:text-[32px] lg:leading-[38px]"
        />
        <input
          data-description=""
          aria-label={t("description")}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t("addADescriptionOptional")}
          maxLength={280}
          className="w-full bg-transparent text-base leading-6 outline-none placeholder:text-muted-foreground lg:text-sm lg:leading-5"
        />
      </div>

      {editing ? <AutosaveStatus state={state} className="px-4 lg:hidden" /> : null}

      {state.kind === "conflict" ? (
        <ConflictBanner onLoadLatest={() => void loadLatest()} onKeepMine={keepMine} />
      ) : changedElsewhere ? (
        <DraftNotice
          message={t("thisPasteWasJustSavedIn")}
          actions={[{ label: t("loadLatest"), onClick: () => void loadLatest(), primary: true }]}
        />
      ) : null}

      {draftNotice?.kind === "restored" ? (
        <DraftNotice
          message={t("restoredTheChangesYouHadnT")}
          actions={[
            {
              label: t("undo"),
              onClick: () => {
                applyValue(initialValue)
                setDraftNotice(null)
              },
            },
            { label: t("dismiss"), onClick: () => setDraftNotice(null), primary: true },
          ]}
        />
      ) : null}

      {draftNotice?.kind === "choose" && draft ? (
        <DraftNotice
          message={t("draftKept", { savedAt: formatDateTime(draftNotice.savedAt, locale) })}
          actions={[
            {
              label: t("discardDraft"),
              onClick: () => {
                void discardDraft()
                setDraftNotice(null)
                setDraftReady(true)
              },
            },
            {
              label: t("restoreDraft"),
              primary: true,
              onClick: () => {
                applyValue(draft.value)
                setDraftNotice({ kind: "restored" })
                setDraftReady(true)
              },
            },
          ]}
        />
      ) : null}

      <FormError message={error} className="mx-4 lg:mx-0" />

      <SidePanelProvider>
        <div className="flex flex-1 flex-col gap-5 lg:flex-row lg:items-start">
          <div className="overflow-hidden rounded-lg mx-4 flex min-h-[340px] min-w-0 flex-1 flex-col border border-border lg:mx-0 lg:min-h-[548px]">
            <FileTabs
              files={files}
              activeId={active?.id}
              onSelect={setActiveId}
              onRename={(id, name) =>
                setFiles((current) => current.map((f) => (f.id === id ? { ...f, name } : f)))
              }
              onRemove={removeFile}
              onAdd={addFile}
              onChangeLanguage={() => setLanguageOpen(true)}
              trailing={sharedEdit ? undefined : <SidePanelToggle />}
            />

            {preview ? (
              <CodeBlock
                content={active?.content || " "}
                highlighted={previewLines}
                wrap
                lineNumbers={lineNumbers}
                className="flex-1 bg-muted dark:bg-sidebar"
              />
            ) : (
              <div className="group/code flex flex-1 gap-[18px] overflow-auto bg-muted p-4 font-mono dark:bg-sidebar text-[13px] leading-[22px]">
                {lineNumbers ? (
                  <div
                    aria-hidden="true"
                    style={{ minWidth: `${String(lineCount).length}ch` }}
                    className="shrink-0 text-right text-muted-foreground/60 tabular-nums select-none"
                  >
                    {Array.from({ length: lineCount }, (_, index) => (
                      <div
                        key={index}
                        className={cn(
                          index + 1 === cursor.line && "group-focus-within/code:text-foreground",
                        )}
                      >
                        {index + 1}
                      </div>
                    ))}
                  </div>
                ) : null}
                <HighlightedTextarea
                  aria-label={t("contentsOf", { name: active?.name ?? t("file") })}
                  lines={lines}
                  activeLine={cursor.line}
                  value={active?.content ?? ""}
                  ref={bindTextarea}
                  onChange={(event) => {
                    const textarea = event.target
                    if (active) {
                      history.edit(
                        active.id,
                        active.content,
                        snapshotOf(textarea),
                        editKind((event.nativeEvent as InputEvent).inputType),
                      )
                    }
                    updateActive({ content: textarea.value })
                    trackCursor(textarea)
                  }}
                  onSelect={(event) => {
                    if (active) history.moveCaret(active.id, snapshotOf(event.currentTarget))
                    trackCursor(event.currentTarget)
                  }}
                  onKeyDown={onEditorKeyDown}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  placeholder={t("pasteOrTypeCode")}
                  rows={Math.max(lineCount, 12)}
                  wrap="off"
                  metricsClassName="text-base leading-[22px] lg:text-[13px] lg:leading-[22px]"
                />
              </div>
            )}

            {secret ? (
              <p
                role="status"
                className="border-t border-primary bg-primary/5 px-4 py-2 text-xs text-link"
              >
                {t("secretWarning", { line: secret.line, file: secret.file, name: secret.name })}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
              <LanguagePicker
                value={language.id}
                onValueChange={(id) => {
                  if (active)
                    updateActive({ name: renameForLanguage(active.name, getLanguage(id)) })
                }}
                side="top"
                open={languageOpen}
                onOpenChange={setLanguageOpen}
                aria-label={t("languageName", { name: language.name })}
                className="rounded-md -my-1.5 -ml-1.5 flex h-10 items-center gap-2 px-1.5 outline-none lg:my-0 lg:h-auto lg:py-0.5 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-muted"
              >
                <LanguageIcon language={language.id} />
                <span className="font-medium text-foreground">{language.name}</span>
                <ChevronDownIcon className="size-3" />
              </LanguagePicker>
              <span className="tabular-nums">
                {t("cursorPosition", { line: cursor.line, column: cursor.column })} ·{" "}
                {t("fileCount", { count: files.length })} · {formatBytes(totalBytes, locale)}
              </span>
            </div>
          </div>

          {sharedEdit ? null : (
            <SidePanel label={t("options")} sections={panelSections} defaultOpen={["access"]} />
          )}
        </div>
      </SidePanelProvider>

      {/* Mobile bottom bar: the settings chip opens every option in one sheet. It steps aside
          while the on-screen keyboard is up, so the code being typed stays in view. */}
      <div
        hidden={keyboardUp}
        className="sticky bottom-0 z-20 mt-6 box-content flex h-14 items-center gap-2 border-t border-border bg-background pr-[max(1rem,env(safe-area-inset-right))] pb-[env(safe-area-inset-bottom)] pl-[max(1rem,env(safe-area-inset-left))] lg:hidden"
      >
        {sharedEdit ? null : (
          <Button
            type="button"
            variant="outline"
            size="xl"
            aria-haspopup="dialog"
            aria-label={`${t("pasteSettings")}: ${settingsSummary}`}
            onClick={() => setSettingsOpen(true)}
            className="min-w-0 flex-1 justify-start px-3"
          >
            {passwordOn || burnAfterRead ? <LockIcon /> : <EyeIcon />}
            <span className="truncate">{settingsSummary}</span>
            <ChevronUpIcon className="ml-auto text-muted-foreground" />
          </Button>
        )}
        <Button
          type="submit"
          size="xl"
          loading={pending}
          className={cn("shrink-0", sharedEdit && "flex-1")}
        >
          {editing ? t("done") : pending ? t("saving") : t("createPaste")}
        </Button>
      </div>

      {sharedEdit ? null : (
        <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
          <SheetContent side="bottom" className="lg:hidden">
            <SheetHeader title={t("pasteSettings")} closeLabel={t("close")} />
            <SheetBody className="flex flex-col divide-y divide-border pb-0 text-sm">
              {optionSections(true).map((section) => (
                <section key={section.id} className="flex flex-col gap-3 py-4 first:pt-2">
                  <h2 className="flex items-center gap-2 font-medium">
                    <section.icon className="size-4 text-muted-foreground" />
                    {section.label}
                  </h2>
                  {section.content}
                </section>
              ))}
            </SheetBody>
            <div className="shrink-0 border-t border-border px-4 py-3">
              <SheetClose render={<Button variant="inverted" size="xl" className="w-full" />}>
                {t("done")}
              </SheetClose>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </form>
  )
}
