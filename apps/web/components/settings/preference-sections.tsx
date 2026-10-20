"use client"

import { SegmentedControl } from "@sniptide/ui/components/segmented-control"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sniptide/ui/components/select"
import { Switch } from "@sniptide/ui/components/switch"
import { useTranslations } from "next-intl"
import { useTheme } from "next-themes"
import * as React from "react"
import type { Preferences } from "@/lib/preferences"
import { updatePreferences } from "@/lib/settings-actions"
import { SaveStatus, SettingRow, SettingsSection } from "./section"

// Keeps the controls instant: the local copy changes right away and the server action saves
// it; a failed save puts the old value back.
function usePreferences(initial: Preferences) {
  const t = useTranslations("Settings")
  const [preferences, setPreferences] = React.useState(initial)
  const [status, setStatus] = React.useState<{ ok: boolean; message: string } | null>(null)
  const [, startTransition] = React.useTransition()

  function change(patch: Partial<Preferences>) {
    const previous = preferences
    setPreferences({ ...preferences, ...patch })
    setStatus(null)
    startTransition(async () => {
      const result = await updatePreferences(patch).catch(() => null)
      if (!result?.ok) {
        setPreferences(previous)
        setStatus({ ok: false, message: result?.error ?? t("couldnTSaveTryAgain") })
        return
      }
      setStatus({ ok: true, message: t("saved") })
    })
  }

  return { preferences, change, status }
}

const themeOptions = [
  { value: "light", label: "light" },
  { value: "dark", label: "dark" },
  { value: "system", label: "system" },
] as const

export function ThemeControl({ className }: { className?: string }) {
  const t = useTranslations("Settings")
  const { theme, setTheme } = useTheme()
  // The theme is only known in the browser; render "system" until mounted.
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  return (
    <SegmentedControl
      aria-labelledby="theme-label"
      value={(mounted ? theme : "system") as "light" | "dark" | "system"}
      onValueChange={setTheme}
      options={themeOptions.map((option) => ({ ...option, label: t(option.label) }))}
      className={className ?? "w-[188px]"}
      itemClassName="px-3"
    />
  )
}

export function EditorSection({ initial }: { initial: Preferences }) {
  const t = useTranslations("Settings")
  const { preferences, change, status } = usePreferences(initial)

  return (
    <SettingsSection title={t("editor")} description={t("howCodeLooksWhileYouWrite")}>
      <SettingRow
        id="theme-label"
        label={t("theme")}
        description={t("followsYourSystemByDefaultSaved")}
      >
        <ThemeControl />
      </SettingRow>
      <SettingRow
        id="indent-label"
        label={t("indentation")}
        description={t("whatTheTabKeyInsertsIn")}
      >
        <Select
          value={preferences.indentation}
          onValueChange={(indentation) =>
            change({ indentation: indentation as Preferences["indentation"] })
          }
          items={(["2", "4", "tab"] as const).map((value) => ({
            value,
            label: t("indentationValue", { value }),
          }))}
        >
          <SelectTrigger aria-labelledby="indent-label" className="h-[34px] w-[150px] text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(["2", "4", "tab"] as const).map((value) => (
              <SelectItem key={value} value={value} className="text-[13px]">
                {t("indentationValue", { value })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>
      <SettingRow
        id="line-numbers-label"
        label={t("lineNumbers")}
        description={t("showLineNumbersWhenYouView")}
      >
        <Switch
          aria-labelledby="line-numbers-label"
          checked={preferences.lineNumbers}
          onCheckedChange={(lineNumbers) => change({ lineNumbers })}
        />
      </SettingRow>
      <SettingRow
        id="secrets-label"
        label={t("secretDetection")}
        description={t("warnWhenSomethingLooksLikeA")}
      >
        <Switch
          aria-labelledby="secrets-label"
          checked={preferences.secretDetection}
          onCheckedChange={(secretDetection) => change({ secretDetection })}
        />
      </SettingRow>
      <SaveStatus status={status} />
    </SettingsSection>
  )
}

const expiryOptions: { value: Preferences["defaultExpiry"]; label: string }[] = [
  { value: "1h", label: "1Hour" },
  { value: "1d", label: "1Day" },
  { value: "1w", label: "1Week" },
  { value: "1m", label: "1Month" },
  { value: "never", label: "never" },
]

export function DefaultsSection({ initial }: { initial: Preferences }) {
  const t = useTranslations("Settings")
  const { preferences, change, status } = usePreferences(initial)

  return (
    <SettingsSection title={t("newPastes")} description={t("whereNewPasteAndQuickPaste")}>
      <SettingRow id="default-visibility-label" label={t("visibility")}>
        <SegmentedControl
          aria-labelledby="default-visibility-label"
          value={preferences.defaultVisibility}
          onValueChange={(defaultVisibility) => change({ defaultVisibility })}
          options={[
            { value: "private", label: t("private") },
            { value: "unlisted", label: t("unlisted") },
            { value: "public", label: t("public") },
          ]}
          className="w-[240px]"
        />
      </SettingRow>
      <SettingRow id="default-expiry-label" label={t("expiresAfter")}>
        <Select
          value={preferences.defaultExpiry}
          onValueChange={(defaultExpiry) =>
            change({ defaultExpiry: defaultExpiry as Preferences["defaultExpiry"] })
          }
          items={expiryOptions.map((option) => ({ ...option, label: t(option.label) }))}
        >
          <SelectTrigger
            aria-labelledby="default-expiry-label"
            className="h-[34px] w-[120px] text-[13px]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {expiryOptions.map((option) => (
              <SelectItem key={option.value} value={option.value} className="text-[13px]">
                {t(option.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>
      <SettingRow
        id="default-burn-label"
        label={t("burnAfterRead")}
        description={t("deleteNewPastesAfterTheirFirst")}
      >
        <Switch
          aria-labelledby="default-burn-label"
          checked={preferences.defaultBurnAfterRead}
          onCheckedChange={(defaultBurnAfterRead) => change({ defaultBurnAfterRead })}
        />
      </SettingRow>
      <SaveStatus status={status} />
    </SettingsSection>
  )
}
