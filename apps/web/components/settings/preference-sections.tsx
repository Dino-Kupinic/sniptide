"use client"

import { SegmentedControl } from "@workspace/ui/components/segmented-control"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Switch } from "@workspace/ui/components/switch"
import { useTheme } from "next-themes"
import * as React from "react"
import type { Preferences } from "@/lib/preferences"
import { indentLabel } from "@/lib/preferences"
import { updatePreferences } from "@/lib/settings-actions"
import { SaveStatus, SettingRow, SettingsSection } from "./section"

// Keeps the controls instant: the local copy changes right away and the server action saves
// it; a failed save puts the old value back.
function usePreferences(initial: Preferences) {
  const [preferences, setPreferences] = React.useState(initial)
  const [status, setStatus] = React.useState<{ ok: boolean; message: string } | null>(null)
  const [, startTransition] = React.useTransition()

  function change(patch: Partial<Preferences>) {
    const previous = preferences
    setPreferences({ ...preferences, ...patch })
    setStatus(null)
    startTransition(async () => {
      const result = await updatePreferences(patch)
      if (!result.ok) {
        setPreferences(previous)
        setStatus({ ok: false, message: result.error })
      }
    })
  }

  return { preferences, change, status }
}

const themeOptions = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const

export function ThemeControl({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  // The theme is only known in the browser; render "system" until mounted.
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  return (
    <SegmentedControl
      aria-labelledby="theme-label"
      value={(mounted ? theme : "system") as "light" | "dark" | "system"}
      onValueChange={setTheme}
      options={[...themeOptions]}
      className={className ?? "w-[188px]"}
      itemClassName="px-3"
    />
  )
}

export function EditorSection({ initial }: { initial: Preferences }) {
  const { preferences, change, status } = usePreferences(initial)

  return (
    <SettingsSection
      title="Editor"
      description="How code looks while you write and when you read it."
    >
      <SettingRow
        id="theme-label"
        label="Theme"
        description="Follows your system by default. Saved on this device."
      >
        <ThemeControl />
      </SettingRow>
      <SettingRow
        id="indent-label"
        label="Indentation"
        description="What the Tab key inserts in the editor"
      >
        <Select
          value={preferences.indentation}
          onValueChange={(indentation) =>
            change({ indentation: indentation as Preferences["indentation"] })
          }
          items={(["2", "4", "tab"] as const).map((value) => ({
            value,
            label: indentLabel(value),
          }))}
        >
          <SelectTrigger aria-labelledby="indent-label" className="h-[34px] w-[110px] text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(["2", "4", "tab"] as const).map((value) => (
              <SelectItem key={value} value={value} className="text-[13px]">
                {indentLabel(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>
      <SettingRow
        id="line-numbers-label"
        label="Line numbers"
        description="Show line numbers when you view a paste"
      >
        <Switch
          aria-labelledby="line-numbers-label"
          checked={preferences.lineNumbers}
          onCheckedChange={(lineNumbers) => change({ lineNumbers })}
        />
      </SettingRow>
      <SettingRow
        id="secrets-label"
        label="Secret detection"
        description="Warn when something looks like a key or token"
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
  { value: "1h", label: "1 hour" },
  { value: "1d", label: "1 day" },
  { value: "1w", label: "1 week" },
  { value: "1m", label: "1 month" },
  { value: "never", label: "Never" },
]

export function DefaultsSection({ initial }: { initial: Preferences }) {
  const { preferences, change, status } = usePreferences(initial)

  return (
    <SettingsSection
      title="New pastes"
      description="Where New paste and Quick paste start. You can still change each paste."
    >
      <SettingRow id="default-visibility-label" label="Visibility">
        <SegmentedControl
          aria-labelledby="default-visibility-label"
          value={preferences.defaultVisibility}
          onValueChange={(defaultVisibility) => change({ defaultVisibility })}
          options={[
            { value: "private", label: "Private" },
            { value: "unlisted", label: "Unlisted" },
            { value: "public", label: "Public" },
          ]}
          className="w-[240px]"
        />
      </SettingRow>
      <SettingRow id="default-expiry-label" label="Expires after">
        <Select
          value={preferences.defaultExpiry}
          onValueChange={(defaultExpiry) =>
            change({ defaultExpiry: defaultExpiry as Preferences["defaultExpiry"] })
          }
          items={expiryOptions}
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
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>
      <SettingRow
        id="default-burn-label"
        label="Burn after read"
        description="Delete new pastes after their first view"
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
