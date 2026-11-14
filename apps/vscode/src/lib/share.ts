import type { CaptureInput, Paste, SettingsInput, SniptideClient, Visibility } from "@sniptide/sdk"
import { messages } from "./messages"

// Creating a shared link, with the options the share command offers. Pure, so the order of the
// requests is tested without the editor.

export type Expiry = NonNullable<SettingsInput["expiry"]>

export const VISIBILITIES: Visibility[] = ["unlisted", "public", "private"]
export const EXPIRIES: Expiry[] = ["never", "1h", "1d", "1w", "1m", "1y"]

export interface ShareOptions {
  visibility: Visibility
  expiry: Expiry
  // Null shares without a password. The password is never stored between shares.
  password: string | null
}

export const DEFAULT_OPTIONS: ShareOptions = {
  visibility: "unlisted",
  expiry: "never",
  password: null,
}

// The options to start the next share from: the last visibility and expiry, when they are still
// values this version offers.
export function rememberedOptions(value: unknown): ShareOptions {
  const stored = (value && typeof value === "object" ? value : {}) as Partial<ShareOptions>
  return {
    visibility:
      VISIBILITIES.find((item) => item === stored.visibility) ?? DEFAULT_OPTIONS.visibility,
    expiry: EXPIRIES.find((item) => item === stored.expiry) ?? DEFAULT_OPTIONS.expiry,
    password: null,
  }
}

// "Unlisted, never expires" for the row that creates the link.
export function summarize(options: ShareOptions) {
  const parts = [messages.visibilityNames[options.visibility]]
  parts.push(
    options.expiry === "never"
      ? "never expires"
      : `expires ${messages.expiryNames[options.expiry].toLowerCase()}`,
  )
  if (options.password) parts.push("password protected")
  return parts.join(", ")
}

export class ShareOptionsError extends Error {
  constructor() {
    super(messages.optionsNotSet)
    this.name = "ShareOptionsError"
  }
}

type Run = <T>(call: (client: SniptideClient) => Promise<T>) => Promise<T>

// Creates the paste and returns it with its link. The token API takes an expiry and a password
// only as a change to an existing paste, so a share that needs either starts private and becomes
// readable in the same request that sets them. A link never works before its protection does, and
// a paste whose options can't be set goes to the trash.
export async function share(
  run: Run,
  capture: CaptureInput,
  options: ShareOptions,
  idempotencyKey: string = crypto.randomUUID(),
): Promise<Paste> {
  const needsSettings = options.expiry !== "never" || options.password !== null
  const { paste } = await run((client) =>
    client.createPaste(
      { ...capture, visibility: needsSettings ? "private" : options.visibility },
      idempotencyKey,
    ),
  )
  if (!needsSettings) return paste
  try {
    const updated = await run((client) =>
      client.updateSettings(paste.id, {
        visibility: options.visibility,
        ...(options.expiry === "never" ? {} : { expiry: options.expiry }),
        ...(options.password === null ? {} : { password: options.password }),
      }),
    )
    return { ...paste, ...updated.paste }
  } catch {
    await run((client) => client.trashPaste(paste.id)).catch(() => {})
    throw new ShareOptionsError()
  }
}
