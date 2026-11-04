"use client"

import { Button } from "@sniptide/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@sniptide/ui/components/dialog"
import { Textarea } from "@sniptide/ui/components/textarea"
import { BugIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import * as React from "react"
import { buildReportDiagnostics, type ReportContext, reportIssueUrl } from "@/lib/bug-report/draft"

const ReportContextValue = React.createContext<
  Pick<ReportContext, "version" | "userId" | "instance">
>({ version: "unknown", userId: "unknown", instance: "self-hosted" })

export function BugReportProvider({
  context,
  children,
}: {
  context: React.ContextType<typeof ReportContextValue>
  children: React.ReactNode
}) {
  return <ReportContextValue value={context}>{children}</ReportContextValue>
}

export function BugReportButton({
  className,
  iconOnly = false,
}: {
  className?: string
  iconOnly?: boolean
}) {
  const t = useTranslations("Workspace")
  const context = React.useContext(ReportContextValue)
  const [open, setOpen] = React.useState(false)
  const [description, setDescription] = React.useState("")
  const [diagnostics, setDiagnostics] = React.useState("")
  const id = React.useId()
  const body = `${description.trim()}\n\n${diagnostics}`
  const href = reportIssueUrl(body)

  function startReport() {
    // Read current browser state at click time; never during server rendering.
    setDiagnostics(
      buildReportDiagnostics({
        ...context,
        url: window.location.href,
        browser: navigator.userAgent,
      }),
    )
    setOpen(true)
  }

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={startReport}
        aria-label={t("report_bug")}
        aria-haspopup="dialog"
      >
        <BugIcon className="size-4 shrink-0" />
        {!iconOnly && t("report_bug")}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogTitle>{t("report_bug")}</DialogTitle>
          <DialogDescription>{t("report_notice")}</DialogDescription>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              if (href && description.trim()) window.open(href, "_blank", "noopener,noreferrer")
            }}
          >
            <label htmlFor={`${id}-description`} className="text-sm font-medium">
              {t("report_description")}
            </label>
            <Textarea
              id={`${id}-description`}
              required
              maxLength={2000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
            />
            <label htmlFor={`${id}-context`} className="text-sm font-medium">
              {t("report_context")}
            </label>
            <Textarea
              id={`${id}-context`}
              value={diagnostics}
              onChange={(event) => setDiagnostics(event.target.value)}
              rows={6}
              className="font-mono text-xs"
            />
            <p className="text-sm text-muted-foreground">{t("report_screenshot")}</p>
            {!href && (
              <p role="alert" className="text-sm text-destructive">
                {t("report_too_long")}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <DialogClose render={<Button type="button" variant="outline" />}>
                {t("cancel")}
              </DialogClose>
              <Button type="submit" disabled={!description.trim() || !href}>
                {t("report_continue")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
