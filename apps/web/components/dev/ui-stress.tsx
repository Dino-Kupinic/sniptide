"use client"

import { SegmentedControl } from "@sniptide/ui/components/segmented-control"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { CollectionsView } from "@/components/collections/collections-view"
import { PasteList } from "@/components/lists/paste-list"
import { SharedList } from "@/components/lists/shared-list"
import { TrashList } from "@/components/lists/trash-list"
import { InvitePeople } from "@/components/paste/invite-people"
import { PasteEditor } from "@/components/paste/paste-editor"
import { AppShell } from "@/components/shell/app-shell"
import { defaultSidebarState } from "@/components/shell/sidebar-state"
import { SiteHostProvider } from "@/components/site-host"
import {
  type Dataset,
  datasets,
  type StressScreen,
  screens,
  type stressData,
} from "@/lib/dev/ui-stress-data"
import type { PageInfo, PasteListQuery } from "@/lib/pastes/list-query"

export function UiStress({
  dataset,
  screen,
  query,
  pagination,
  data,
  shared,
}: {
  dataset: Dataset
  screen: StressScreen
  query: PasteListQuery
  pagination: PageInfo
  shared: Omit<React.ComponentProps<typeof SharedList>, "origin" | "host">
  data: ReturnType<typeof stressData>
}) {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  const [invites, setInvites] = useState(data.invites)
  const host = "paste.platform-infrastructure.example.com"
  const origin = `https://${host}`
  const start = (pagination.page - 1) * 10
  const starred = data.pastes.filter((row) => row.starred)
  return (
    <SiteHostProvider host={host}>
      <div className="pb-48">
        <AppShell
          viewer={data.viewer}
          initialSidebar={defaultSidebarState}
          collections={data.collections}
          data={{
            counts: {
              pastes: data.pastes.length,
              starred: starred.length,
              shared: data.rows.length,
            },
            recent: data.pastes.slice(0, 8).map((row) => ({ ...row, owned: true })),
            starred: starred.slice(0, 3).map((row) => ({ ...row, owned: true })),
          }}
        >
          {screen === "pastes" ? (
            <PasteList
              title={dataset === "demo" ? "My pastes" : "Benachrichtigungseinstellungen"}
              rows={data.pastes.slice(start, start + 10)}
              origin={origin}
              host={host}
              mode="mine"
              collections={data.collections}
              query={query}
              pagination={pagination}
              languageOptions={["typescript", "objective-c", "text", "python"]}
            />
          ) : null}
          {screen === "shared" ? <SharedList {...shared} origin={origin} host={host} /> : null}
          {screen === "trash" ? (
            <TrashList
              rows={data.trash.slice(start, start + 10)}
              sizeLabel="12.0 MB"
              host={host}
              query={query}
              pagination={pagination}
            />
          ) : null}
          {screen === "collections" ? <CollectionsView collections={data.collections} /> : null}
          {screen === "editor" ? (
            <PasteEditor
              initial={data.editor}
              collections={data.collections}
              draftScope="ui-stress"
              secretDetection={false}
            />
          ) : null}
          {screen === "invites" ? (
            <div className="mx-auto w-full max-w-sm p-4">
              <InvitePeople invites={invites} onChange={setInvites} large />
            </div>
          ) : null}
        </AppShell>
      </div>
      <div
        data-stress-ready={ready}
        className="fixed bottom-2 left-1/2 z-50 flex w-[min(36rem,calc(100%-1rem))] -translate-x-1/2 flex-col gap-1 border border-border bg-background p-1 font-sans shadow-sm"
      >
        <SegmentedControl
          aria-label="Stress screen"
          value={screen}
          onValueChange={(next) => router.replace(`/dev/ui-stress/${dataset}/${next}`)}
          options={screens.map((value) => ({ value, label: value }))}
          itemClassName="px-1"
          className="flex-wrap"
        />
        <SegmentedControl
          aria-label="Stress dataset"
          value={dataset}
          onValueChange={(next) => router.replace(`/dev/ui-stress/${next}/${screen}`)}
          options={datasets.map((value) => ({
            value,
            label: {
              demo: "Demo data",
              worst: "Worst case",
              empty: "Empty",
              one: "One",
              large: "1,284 rows",
            }[value],
          }))}
          itemClassName="px-1"
          className="flex-wrap"
        />
      </div>
    </SiteHostProvider>
  )
}
