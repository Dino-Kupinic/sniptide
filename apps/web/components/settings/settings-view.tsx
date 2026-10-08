"use client"

import { Button } from "@workspace/ui/components/button"
import { Progress } from "@workspace/ui/components/progress"
import { cn } from "@workspace/ui/lib/utils"
import { ChevronRightIcon, KeyRoundIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { authClient } from "@/lib/auth-client"
import type { Preferences } from "@/lib/preferences"
import { DeleteAccountSection } from "./delete-account"
import { DefaultsSection, EditorSection } from "./preference-sections"
import { ProfileSection, type ProfileState } from "./profile-section"
import { SettingsSection } from "./section"

export type SettingsTab = "general" | "defaults" | "api" | "billing"

const tabs: { value: SettingsTab; label: string }[] = [
  { value: "general", label: "General" },
  { value: "defaults", label: "Paste defaults" },
  { value: "api", label: "API tokens" },
  { value: "billing", label: "Billing" },
]

export interface WorkspaceCounts {
  shared: number
  collections: number
  trash: number
  pastes: number
}

function StorageMeter({ usedMb, limitMb }: { usedMb: number; limitMb: number }) {
  return (
    <div className="flex flex-col gap-3 border border-border p-4">
      <div className="flex items-center justify-between text-[15px] lg:text-sm">
        <span className="font-medium">Storage</span>
        <span className="text-muted-foreground tabular-nums">
          {usedMb} / {limitMb} MB
        </span>
      </div>
      <Progress value={(usedMb / limitMb) * 100} />
    </div>
  )
}

export function SettingsView({
  initialTab,
  profile,
  preferences,
  counts,
  storage,
}: {
  initialTab: SettingsTab
  profile: ProfileState
  preferences: Preferences
  counts: WorkspaceCounts
  storage: { usedMb: number; limitMb: number }
}) {
  const router = useRouter()
  const [tab, setTab] = React.useState(initialTab)

  function selectTab(next: SettingsTab) {
    setTab(next)
    // Keep the tab in the URL so it survives a reload and can be linked to.
    window.history.replaceState(
      null,
      "",
      next === "general" ? "/settings" : `/settings?tab=${next}`,
    )
  }

  return (
    <div className="flex flex-col gap-5 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-6 lg:gap-6 lg:p-7">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-[30px] leading-9 font-bold tracking-[-0.02em] uppercase lg:text-4xl lg:leading-10">
          Settings
        </h1>
        <p className="hidden text-sm text-muted-foreground lg:block">
          Manage your profile, paste defaults and API access.
        </p>
      </div>

      {/* On phones Settings is also the "More" tab, so it carries the workspace links. */}
      <section aria-label="Workspace" className="flex flex-col gap-2 lg:hidden">
        <h2 className="px-1 text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase">
          Workspace
        </h2>
        <nav className="flex flex-col divide-y divide-border border border-border text-[15px]">
          {[
            { href: "/shared", label: "Shared with me", count: counts.shared },
            { href: "/collections/api-snippets", label: "Collections", count: counts.collections },
            { href: "/trash", label: "Trash", count: counts.trash },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex h-12 items-center justify-between px-4 active:bg-muted"
            >
              {item.label}
              <span className="flex items-center gap-1 text-muted-foreground">
                {item.count}
                <ChevronRightIcon className="size-4" />
              </span>
            </Link>
          ))}
        </nav>
      </section>

      <div
        role="tablist"
        aria-label="Settings"
        className="-mx-4 flex gap-6 overflow-x-auto border-b border-border px-4 lg:mx-0 lg:px-0"
      >
        {tabs.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            id={`tab-${item.value}`}
            aria-selected={tab === item.value}
            aria-controls="settings-panel"
            onClick={() => selectTab(item.value)}
            className={cn(
              "-mb-px shrink-0 border-b-2 border-transparent pb-2.5 text-sm whitespace-nowrap text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
              tab === item.value && "border-primary font-medium text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div
        id="settings-panel"
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        className="flex flex-col"
      >
        {tab === "general" ? (
          <>
            <ProfileSection profile={profile} />
            <EditorSection initial={preferences} />
            <DeleteAccountSection pasteCount={counts.pastes} />
          </>
        ) : null}
        {tab === "defaults" ? <DefaultsSection initial={preferences} /> : null}
        {tab === "api" ? (
          <SettingsSection
            title="API tokens"
            description="For scripts and editor plugins that create pastes for you."
          >
            <div className="flex flex-col items-start gap-2 border border-dashed border-input p-5">
              <KeyRoundIcon className="size-5 text-muted-foreground" />
              <p className="text-sm font-medium">No API yet</p>
              <p className="text-[13px] text-muted-foreground">
                Sniptide doesn't have a public API yet, so there are no tokens to create. They'll
                show up here when it does.
              </p>
            </div>
          </SettingsSection>
        ) : null}
        {tab === "billing" ? (
          <SettingsSection title="Plan" description="Sniptide is free while it's in early access.">
            <div className="flex items-center justify-between border border-border p-4">
              <div className="flex flex-col">
                <span className="text-sm font-medium">Free</span>
                <span className="text-[13px] text-muted-foreground">
                  {storage.limitMb} MB of pastes, unlimited share links
                </span>
              </div>
              <span className="text-xs text-muted-foreground">No payment method needed</span>
            </div>
            <StorageMeter usedMb={storage.usedMb} limitMb={storage.limitMb} />
          </SettingsSection>
        ) : null}
      </div>

      <div className="flex flex-col items-center gap-4 lg:hidden">
        <div className="w-full">
          <StorageMeter usedMb={storage.usedMb} limitMb={storage.limitMb} />
        </div>
        <Button
          variant="ghost"
          className="text-[15px]"
          onClick={async () => {
            await authClient.signOut()
            router.replace("/sign-in")
            router.refresh()
          }}
        >
          Sign out
        </Button>
      </div>
    </div>
  )
}
