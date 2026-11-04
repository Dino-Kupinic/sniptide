"use client"

import { Button } from "@sniptide/ui/components/button"
import { Input } from "@sniptide/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sniptide/ui/components/select"
import { SearchIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import * as React from "react"

const ALL = "all"

// Search and language for a profile's paste list. Each change is a full page load of the new
// address, since the profile can be served on the share domain where the app's client router
// can't fetch (see getAppOrigin).
export function ProfileFilters({
  path,
  q,
  language,
  languages,
}: {
  path: string
  q: string
  language: string | null
  languages: { id: string; name: string }[]
}) {
  const t = useTranslations("Profile")
  const [text, setText] = React.useState(q)
  const go = (next: { q: string; language: string | null }) => {
    const params = new URLSearchParams()
    if (next.q.trim()) params.set("q", next.q.trim())
    if (next.language) params.set("language", next.language)
    const query = params.toString()
    window.location.assign(query ? `${path}?${query}` : path)
  }
  const items = [
    { value: ALL, label: t("allLanguages") },
    ...languages.map(({ id, name }) => ({ value: id, label: name })),
  ]

  return (
    <search className="flex min-w-0 flex-col gap-2 sm:flex-row">
      <form
        className="relative min-w-0 flex-1"
        onSubmit={(event) => {
          event.preventDefault()
          go({ q: text, language })
        }}
      >
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          name="q"
          value={text}
          maxLength={100}
          onChange={(event) => setText(event.target.value)}
          aria-label={t("search")}
          placeholder={t("search")}
          className="pr-10 pl-9 focus-visible:pl-[35px] [&::-webkit-search-cancel-button]:hidden"
        />
        {q ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("clearSearch")}
            className="absolute top-1/2 right-1.5 -translate-y-1/2"
            onClick={() => go({ q: "", language })}
          >
            <XIcon />
          </Button>
        ) : null}
      </form>
      {languages.length > 1 ? (
        <Select
          value={language ?? ALL}
          onValueChange={(value) => go({ q, language: value === ALL || !value ? null : value })}
          items={items}
        >
          <SelectTrigger
            aria-label={t("language")}
            className="h-10 min-w-0 gap-1.5 pr-2.5 pl-3 sm:w-48 [&>span]:truncate"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="min-w-48">
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </search>
  )
}
