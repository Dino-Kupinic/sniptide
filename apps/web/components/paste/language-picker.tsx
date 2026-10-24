"use client"

import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxSearch,
  ComboboxTrigger,
} from "@sniptide/ui/components/combobox"
import { useTranslations } from "next-intl"
import type * as React from "react"
import { LanguageIcon } from "@/components/paste/language-icon"
import { getLanguage, type Language, matchesLanguage, pickerGroups } from "@/lib/pastes/languages"

// Picks one of every language Sniptide highlights: the popular ones first, a hairline, then the
// rest by name, with a search field on top that also matches extensions ("rs" finds Rust).
export function LanguagePicker({
  value,
  onValueChange,
  className,
  children,
  side,
  open,
  onOpenChange,
  "aria-label": ariaLabel,
}: {
  value: string
  onValueChange: (id: string) => void
  // The trigger's look and content.
  className?: string
  children: React.ReactNode
  side?: "top" | "bottom"
  // Lets another control open the list, like Change language on a phone's file tab.
  open?: boolean
  onOpenChange?: (open: boolean) => void
  "aria-label": string
}) {
  const t = useTranslations("Core")
  return (
    <Combobox
      items={pickerGroups}
      value={getLanguage(value)}
      onValueChange={(language: Language | null) => {
        if (language) onValueChange(language.id)
      }}
      itemToStringLabel={(language: Language) => language.name}
      filter={(language: Language, query) => matchesLanguage(language, query)}
      autoHighlight
      open={open}
      onOpenChange={onOpenChange ? (next) => onOpenChange(next) : undefined}
    >
      <ComboboxTrigger aria-label={ariaLabel} className={className}>
        {children}
      </ComboboxTrigger>
      <ComboboxContent side={side} aria-label={t("language")}>
        <ComboboxSearch placeholder={t("searchLanguages")} aria-label={t("searchLanguages")} />
        <ComboboxEmpty>{t("noLanguagesFound")}</ComboboxEmpty>
        <ComboboxList>
          {(group: (typeof pickerGroups)[number]) => (
            <ComboboxGroup key={group.id} items={group.items}>
              <ComboboxCollection>
                {(language: Language) => (
                  <ComboboxItem key={language.id} value={language}>
                    <LanguageIcon language={language.id} />
                    <span className="min-w-0 flex-1 truncate">{language.name}</span>
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
