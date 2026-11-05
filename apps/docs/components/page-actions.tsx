"use client"

import { Button } from "@sniptide/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@sniptide/ui/components/dropdown-menu"
import { ArrowUpRight, Asterisk, Check, ChevronDown, Copy, MessagesSquare } from "lucide-react"
import { type ReactNode, useRef, useState } from "react"
import { getMessages } from "@/lib/messages"

type PageActionsProps = {
  lang: string
  // The page's Markdown, such as /llms.mdx/mcp, and the same address in full for the LLM links.
  markdownPath: string
  markdownUrl: string
}

// "Copy page" beside a page title: a split button that copies the page as Markdown, with a menu
// that opens the page in ChatGPT or Claude. Both links ask the assistant to read the Markdown URL.
export function PageActions({ lang, markdownPath, markdownUrl }: PageActionsProps) {
  const t = getMessages(lang)
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle")
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const prompt = encodeURIComponent(t.askPrompt.replace("{url}", markdownUrl))

  async function copy() {
    clearTimeout(timer.current)
    try {
      // The clipboard item takes a promise so Safari keeps the click's permission while the
      // Markdown loads.
      const text = fetch(markdownPath).then(async (response) => {
        if (!response.ok) throw new Error(`Markdown request failed with ${response.status}`)
        return new Blob([await response.text()], { type: "text/plain" })
      })
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": text })])
      setStatus("copied")
    } catch {
      setStatus("failed")
    }
    timer.current = setTimeout(() => setStatus("idle"), 2500)
  }

  return (
    <div className="not-prose flex shrink-0 items-start">
      <Button
        variant="outline"
        size="sm"
        className="rounded-e-none"
        onClick={copy}
        aria-live="polite"
        title={status === "failed" ? t.copyFailed : undefined}
      >
        {status === "copied" ? (
          <Check data-icon="inline-start" />
        ) : (
          <Copy data-icon="inline-start" />
        )}
        {status === "copied" ? t.copied : t.copyPage}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="icon-sm"
              className="rounded-s-none border-s-0"
              aria-label={t.pageOptions}
            />
          }
        >
          <ChevronDown />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <MenuRow icon={<Copy />} title={t.copyPage} hint={t.copyPageHint} onClick={copy} />
          <MenuRow
            icon={<MessagesSquare />}
            title={t.openChatGpt}
            hint={t.askHint}
            href={`https://chatgpt.com/?hints=search&q=${prompt}`}
          />
          <MenuRow
            icon={<Asterisk />}
            title={t.openClaude}
            hint={t.askHint}
            href={`https://claude.ai/new?q=${prompt}`}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      {status === "failed" && (
        <span role="alert" className="sr-only">
          {t.copyFailed}
        </span>
      )}
    </div>
  )
}

type MenuRowProps = {
  icon: ReactNode
  title: string
  hint: string
  href?: string
  onClick?: () => void
}

// A menu row with a 32px icon tile, the action and one line on what it does. External links end in
// an arrow and open in a new tab.
function MenuRow({ icon, title, hint, href, onClick }: MenuRowProps) {
  const body = (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background [&_svg]:text-foreground">
        {icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-1 font-medium text-foreground">
          {title}
          {href && <ArrowUpRight aria-hidden className="size-3.5!" />}
        </span>
        <span className="text-[0.8125rem] leading-[1.125rem] text-muted-foreground">{hint}</span>
      </span>
    </>
  )
  const className = "h-auto items-center gap-3 py-2 ps-2"
  if (href) {
    return (
      <DropdownMenuItem
        className={className}
        render={<a href={href} target="_blank" rel="noopener noreferrer" />}
      >
        {body}
      </DropdownMenuItem>
    )
  }
  return (
    <DropdownMenuItem className={className} onClick={onClick}>
      {body}
    </DropdownMenuItem>
  )
}
