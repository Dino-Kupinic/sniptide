"use client"

import { Button } from "@sniptide/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@sniptide/ui/components/dropdown-menu"
import { FormError } from "@sniptide/ui/components/form-error"
import { SegmentedControl } from "@sniptide/ui/components/segmented-control"
import { Sheet, SheetContent, SheetTitle } from "@sniptide/ui/components/sheet"
import { toast } from "@sniptide/ui/components/toast"
import { cn } from "@sniptide/ui/lib/utils"
import { CheckIcon, ChevronDownIcon, EyeIcon, FolderIcon, LinkIcon, LockIcon } from "lucide-react"
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
  OptionGroup,
  PasswordInput,
  SlugInput,
  ToggleRow,
  useSlugStatus,
  visibilityOptions,
} from "@/components/paste/editor-options"
import { type EditorFile, FileTabs } from "@/components/paste/file-tabs"
import { HighlightedTextarea } from "@/components/paste/highlighted-textarea"
import { InvitePeople, type PendingInvite } from "@/components/paste/invite-people"
import { LanguageMarker } from "@/components/paste/language-marker"
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
import { detectLanguage, languages, renameForLanguage } from "@/lib/pastes/languages"
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
  // From the viewer's Settings: what Tab inserts, and whether to warn about pasted secrets.
  indentation?: Preferences["indentation"]
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
  const [mobileMore, setMobileMore] = React.useState(false)
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

  const passwordField = passwordOn ? (
    <>
      <PasswordInput
        value={password}
        onChange={setPassword}
        onCommit={editing ? () => setCommittedPassword(password) : undefined}
        placeholder={hasPassword ? t("leaveEmptyToKeepTheCurrent") : t("password")}
      />
      {editing && !hasPassword && !committedPassword ? (
        <p className="text-xs text-muted-foreground">{t("anyoneWithTheLinkCanOpenMessage")}</p>
      ) : null}
    </>
  ) : null

  const inviteMenu =
    !editing && visibility === "private" ? (
      <InvitePeople invites={invites} onChange={setInvites} />
    ) : null

  const panelSections: PanelSection[] = [
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
          />
          <p className="text-xs text-muted-foreground">
            {t("visibilityHelp", { value: visibility })}
          </p>
          {inviteMenu ? <div className="mt-1 border-t border-border pt-3">{inviteMenu}</div> : null}
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
        />
      ),
    },
    {
      id: "collection",
      label: t("collection"),
      icon: FolderIcon,
      marked: collection !== null,
      content: (
        <CollectionSelect value={collection} onChange={setCollection} collections={collections} />
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
          />
          {passwordField}
          <ToggleRow
            label={t("burnAfterReading")}
            description={t("deletedAfterTheFirstView")}
            checked={burnAfterRead}
            onCheckedChange={setBurnAfterRead}
          />
        </>
      ),
    },
  ]

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
      <div className="sticky top-0 z-20 flex h-[52px] items-center justify-between bg-background px-4 pt-[env(safe-area-inset-top)] box-content lg:hidden">
        {editing ? (
          <button
            type="button"
            onClick={() => void finish()}
            className="text-[15px] font-medium text-link"
          >
            {t("done")}
          </button>
        ) : (
          <Link href={cancelHref} className="text-[15px] text-foreground/80">
            {t("cancel")}
          </Link>
        )}
        <span className="text-[15px] font-semibold">
          {editing ? t("editPaste") : t("newPaste")}
        </span>
        <button
          type="button"
          onClick={() => setPreview((value) => !value)}
          aria-pressed={preview}
          className={cn("text-[15px] text-muted-foreground", preview && "text-link")}
        >
          {preview ? t("edit") : t("preview")}
        </button>
      </div>

      <HeaderTitle>
        {editing ? t("editPaste") : t("newPaste")}
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
        <input
          aria-label={t("title")}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t("untitledPaste")}
          maxLength={120}
          required
          className="w-full bg-transparent font-heading text-[28px] leading-9 font-bold tracking-[-0.02em] caret-primary outline-none placeholder:text-muted-foreground/50 lg:text-[32px] lg:leading-[38px]"
        />
        <input
          aria-label={t("description")}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t("addADescriptionOptional")}
          maxLength={280}
          className="w-full bg-transparent text-[15px] leading-5 outline-none placeholder:text-muted-foreground lg:text-sm lg:leading-5"
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
              trailing={sharedEdit ? undefined : <SidePanelToggle />}
            />

            {preview ? (
              <CodeBlock
                content={active?.content || " "}
                highlighted={previewLines}
                wrap
                className="flex-1"
              />
            ) : (
              <div className="flex flex-1 gap-[18px] overflow-auto p-4 font-mono text-[13px] leading-[22px]">
                <div
                  aria-hidden="true"
                  className="hidden shrink-0 text-right text-muted-foreground/60 select-none lg:block"
                >
                  {Array.from({ length: lineCount }, (_, index) => (
                    <div key={index}>{index + 1}</div>
                  ))}
                </div>
                <HighlightedTextarea
                  aria-label={t("contentsOf", { name: active?.name ?? t("file") })}
                  lines={lines}
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
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label={t("languageName", { name: language.name })}
                  className="rounded-md -ml-1.5 flex items-center gap-2 px-1.5 py-0.5 outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-muted"
                >
                  <LanguageMarker language={language.id} />
                  <span className="font-medium text-foreground">{language.name}</span>
                  <ChevronDownIcon className="size-3" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="top"
                  align="start"
                  className="max-h-80 min-w-44 overflow-y-auto"
                >
                  {languages.map((option) => (
                    <DropdownMenuItem
                      key={option.id}
                      onClick={() => {
                        if (active) updateActive({ name: renameForLanguage(active.name, option) })
                      }}
                    >
                      <LanguageMarker language={option.id} />
                      {option.name}
                      {option.id === language.id ? <CheckIcon className="ml-auto" /> : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <span className="tabular-nums">
                <span className="hidden sm:inline">
                  {t("cursorPosition", { line: cursor.line, column: cursor.column })} ·{" "}
                </span>
                {t("fileCount", { count: files.length })} · {formatBytes(totalBytes, locale)}
              </span>
            </div>
          </div>

          {sharedEdit ? null : (
            <SidePanel label={t("options")} sections={panelSections} defaultOpen={["access"]} />
          )}
        </div>
      </SidePanelProvider>

      {/* Mobile bottom panel */}
      <div className="sticky bottom-0 z-20 mt-6 flex flex-col gap-4 border-t border-border bg-background px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgb(0_0_0/0.04)] lg:hidden">
        <span aria-hidden="true" className="mx-auto h-1 w-9 bg-border" />
        {sharedEdit ? null : (
          <>
            <SegmentedControl
              aria-label={t("visibility")}
              value={visibility}
              onValueChange={setVisibility}
              options={visibilityOptions.map((option) => ({
                ...option,
                label: t("visibilityValue", { value: option.value }),
              }))}
              itemClassName="py-2.5 text-[15px]"
              className="border border-border bg-muted"
            />
            {!editing && visibility === "private" ? (
              <InvitePeople invites={invites} onChange={setInvites} large />
            ) : null}
            <div className="flex flex-col gap-2">
              <span className="text-[15px]">{t("expiresAfter")}</span>
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
            <ToggleRow
              label={t("password")}
              description={t("visitorsMustEnterItToView")}
              checked={passwordOn}
              onCheckedChange={setPasswordOn}
              large
            />
            {passwordField}
            {/* The rarer options wait in a sheet, so the panel stays short. */}
            <button
              type="button"
              onClick={() => setMobileMore(true)}
              className="self-start text-sm text-muted-foreground underline underline-offset-2"
            >
              {t("moreOptions")}
            </button>
            <Sheet open={mobileMore} onOpenChange={setMobileMore}>
              <SheetContent side="bottom">
                <span aria-hidden="true" className="mx-auto mt-2 h-1 w-9 rounded-full bg-border" />
                <SheetTitle className="px-4 pt-3 text-[15px] font-semibold">
                  {t("moreOptions")}
                </SheetTitle>
                <div className="flex flex-col gap-4 overflow-y-auto px-4 pt-4 pb-4">
                  <OptionGroup label={t("customLink")} id="slug-label-mobile">
                    <SlugInput
                      value={slug}
                      onChange={setSlug}
                      onCommit={editing ? () => setCommittedSlug(slug) : undefined}
                      status={slugStatus}
                    />
                  </OptionGroup>
                  <OptionGroup label={t("collection")} id="collection-label-mobile">
                    <CollectionSelect
                      value={collection}
                      onChange={setCollection}
                      collections={collections}
                    />
                  </OptionGroup>
                  <ToggleRow
                    label={t("burnAfterRead")}
                    description={t("deleteAfterTheFirstView")}
                    checked={burnAfterRead}
                    onCheckedChange={setBurnAfterRead}
                    large
                  />
                  <Button
                    type="button"
                    variant="inverted"
                    onClick={() => setMobileMore(false)}
                    className="h-[46px] text-base"
                  >
                    {t("done")}
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </>
        )}
        <Button type="submit" loading={pending} className="h-12 text-base font-semibold">
          {editing ? t("done") : pending ? t("saving") : t("createPaste")}
        </Button>
      </div>
    </form>
  )
}
