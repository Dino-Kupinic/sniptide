"use client"

import { Button } from "@sniptide/ui/components/button"
import { Textarea } from "@sniptide/ui/components/textarea"
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import * as React from "react"
import { ListHeader } from "@/components/lists/toolbar"
import { saveCollectionSteps } from "@/lib/collections/actions"
import type { Collection } from "@/lib/collections/types"
import { runAction } from "@/lib/feedback"

const MAX_INSTRUCTION_LENGTH = 500

export interface EditableStep {
  id: string
  slug: string
  title: string
  instruction: string
}

// A collection read as a flow: its snippets in the order agents get them, each with an
// instruction for that step. Saving sends the whole list, so the order on screen is the order
// MCP and the CLI return.
export function StepEditor({
  collection,
  steps: initial,
}: {
  collection: Collection
  steps: EditableStep[]
}) {
  const t = useTranslations("Workspace")
  const router = useRouter()
  const [steps, setSteps] = React.useState(initial)
  const [pending, startTransition] = React.useTransition()
  const back = `/collections/${collection.slug}`

  function move(from: number, to: number) {
    setSteps((current) => {
      const next = [...current]
      const [step] = next.splice(from, 1)
      if (step) next.splice(to, 0, step)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-6 p-4 lg:gap-8 lg:p-7">
      <ListHeader
        title={t("steps_title", { name: collection.name })}
        description={t("steps_description")}
      />
      {steps.length === 0 ? (
        <div className="flex flex-col items-start gap-4">
          <p className="text-sm text-muted-foreground">{t("steps_empty")}</p>
          <Button variant="outline" render={<Link href={back} />} nativeButton={false}>
            {t("back_to_collection", { name: collection.name })}
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-6 lg:max-w-[560px]"
          onSubmit={(event) => {
            event.preventDefault()
            startTransition(async () => {
              const result = await runAction(
                () =>
                  saveCollectionSteps(
                    collection.slug,
                    steps.map((step) => ({ id: step.id, instruction: step.instruction.trim() })),
                  ),
                { success: t("steps_saved"), error: t("steps_save_error") },
              )
              if (result.ok) router.refresh()
            })
          }}
        >
          <ol className="rounded-lg divide-y divide-border overflow-hidden border border-border">
            {steps.map((step, index) => (
              <li key={step.id} className="flex min-w-0 gap-3 p-3">
                <span className="w-6 shrink-0 pt-0.5 text-right text-sm text-muted-foreground tabular-nums">
                  {index + 1}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Link
                    href={`/${step.slug}`}
                    className="min-w-0 truncate text-sm font-medium hover:underline"
                  >
                    {step.title}
                  </Link>
                  <Textarea
                    aria-label={t("step_instruction", { number: index + 1 })}
                    placeholder={t("step_instruction_placeholder")}
                    maxLength={MAX_INSTRUCTION_LENGTH}
                    className="min-h-16"
                    value={step.instruction}
                    onChange={(event) => {
                      const instruction = event.target.value
                      setSteps((current) =>
                        current.map((item) =>
                          item.id === step.id ? { ...item, instruction } : item,
                        ),
                      )
                    }}
                  />
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-10 lg:size-8"
                    aria-label={t("move_step_up", { title: step.title })}
                    disabled={index === 0}
                    onClick={() => move(index, index - 1)}
                  >
                    <ArrowUpIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-10 lg:size-8"
                    aria-label={t("move_step_down", { title: step.title })}
                    disabled={index === steps.length - 1}
                    onClick={() => move(index, index + 1)}
                  >
                    <ArrowDownIcon />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" loading={pending}>
              {t("save_steps")}
            </Button>
            <Button variant="ghost" render={<Link href={back} />} nativeButton={false}>
              {t("back_to_collection", { name: collection.name })}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
