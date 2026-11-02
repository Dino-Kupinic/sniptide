"use client"

import { Button } from "@sniptide/ui/components/button"
import { Logo } from "@sniptide/ui/components/logo"
import { cn } from "@sniptide/ui/lib/utils"
import { ArrowLeftIcon, BotIcon, CompassIcon, ServerIcon, Share2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import * as React from "react"
import { LifeField } from "@/components/auth/life-field"
import { track } from "@/lib/analytics"
import {
  type AgentClient,
  ONBOARDING_STEPS,
  type OnboardingStep,
  SIGNUP_SOURCES,
  type SignupSource,
  USE_CASES,
  type UseCase,
} from "@/lib/onboarding"
import { saveSignupSource, saveUseCase } from "@/lib/onboarding-actions"
import { AgentStep } from "./agent-step"

const USE_CASE_ICONS: Record<UseCase, React.ComponentType<{ className?: string }>> = {
  agents: BotIcon,
  sharing: Share2Icon,
  team: ServerIcon,
  exploring: CompassIcon,
}

// The welcome wizard a new account sees once, between sign-up and the dashboard: where it heard
// about Sniptide, what it wants to use it for, and an optional agent connection. One question per
// screen, every step skippable, and each answer saved as soon as it is given, so leaving halfway
// keeps what was answered. Every step reports viewed, completed or skipped to PostHog, which makes
// the wizard a funnel of its own.
export function WelcomeWizard({
  origin,
  initialStep,
  initialSource,
  initialUseCase,
}: {
  origin: string
  initialStep: OnboardingStep
  initialSource: SignupSource | null
  initialUseCase: UseCase | null
}) {
  const t = useTranslations("Onboarding")
  const router = useRouter()
  const [step, setStep] = React.useState<OnboardingStep>(initialStep)
  const [source, setSource] = React.useState<SignupSource | null>(initialSource)
  const [useCase, setUseCase] = React.useState<UseCase | null>(initialUseCase)
  const [client, setClient] = React.useState<AgentClient>("claude_code")
  const [copied, setCopied] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  // The source is stored once. Going back to it shows the answer but can't change it.
  const sourceSaved = React.useRef(initialSource !== null || initialStep !== "source")

  const index = ONBOARDING_STEPS.indexOf(step)
  const stepNumber = index + 1
  const headingRef = React.useRef<HTMLHeadingElement>(null)

  React.useEffect(() => {
    track("onboarding_step_viewed", { step, step_number: stepNumber })
  }, [step, stepNumber])

  // Moving to another step puts focus on its question, so screen readers hear it.
  const firstRender = React.useRef(true)
  React.useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    headingRef.current?.focus()
  }, [step])

  function go(next: OnboardingStep) {
    setError(null)
    setStep(next)
  }

  function finish(outcome: "completed" | "exited", connected: AgentClient | null = null) {
    track(outcome === "completed" ? "onboarding_completed" : "onboarding_exited", {
      step,
      source: source ?? "skipped",
      use_case: useCase ?? "skipped",
      agent_client: client,
      agent_setup_copied: copied,
      agent_connected: connected ?? "none",
    })
    router.replace("/dashboard")
    router.refresh()
  }

  async function save(action: () => Promise<{ ok: boolean; error?: string }>) {
    setPending(true)
    setError(null)
    const result = await action().catch(() => ({ ok: false, error: t("saveFailed") }))
    setPending(false)
    if (!result.ok) setError(result.error ?? t("saveFailed"))
    return result.ok
  }

  async function answerSource(answer: SignupSource | "skipped") {
    // Back on a saved answer, Continue only moves on, so the step isn't counted twice.
    if (sourceSaved.current) return go("use_case")
    if (!(await save(() => saveSignupSource(answer)))) return
    sourceSaved.current = true
    if (answer === "skipped") {
      setSource(null)
      track("onboarding_step_skipped", { step: "source", step_number: 1 })
    } else {
      track("onboarding_step_completed", { step: "source", step_number: 1, value: answer })
    }
    go("use_case")
  }

  async function answerUseCase(answer: UseCase | "skipped") {
    if (answer === "skipped") {
      // Skipping still ends the redirect, which needs the row the source step writes.
      if (!sourceSaved.current && !(await save(() => saveSignupSource("skipped")))) return
      sourceSaved.current = true
      setUseCase(null)
      track("onboarding_step_skipped", { step: "use_case", step_number: 2 })
    } else {
      if (!(await save(() => saveUseCase(answer)))) return
      sourceSaved.current = true
      track("onboarding_step_completed", { step: "use_case", step_number: 2, value: answer })
    }
    go("agent")
  }

  // "Skip setup" in the header leaves from any step. The row is written first, so the dashboard
  // doesn't send the account straight back.
  async function exit() {
    if (!sourceSaved.current && !(await save(() => saveSignupSource("skipped")))) return
    sourceSaved.current = true
    finish("exited")
  }

  function onCopy(which: AgentClient) {
    setCopied(true)
    track("onboarding_agent_setup_copied", { client: which })
  }

  // The step counts as completed once an agent is connected, not when a command was copied.
  function completeAgentStep(connected: AgentClient | null) {
    track(connected ? "onboarding_step_completed" : "onboarding_step_skipped", {
      step: "agent",
      step_number: 3,
      ...(connected ? { value: connected } : {}),
    })
    finish("completed", connected)
  }

  return (
    <div className="flex min-h-svh bg-background">
      <div className="flex min-w-0 flex-1 flex-col lg:w-3/5 lg:flex-none lg:px-10 lg:py-8">
        <header className="flex items-center justify-between gap-4 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] lg:px-2 lg:pt-1.5">
          <Logo />
          {step === "agent" ? null : (
            <Button variant="ghost" size="sm" disabled={pending} onClick={exit}>
              {t("skipSetup")}
            </Button>
          )}
        </header>

        <main className="flex flex-1 justify-center px-5 pt-8 pb-28 lg:items-center lg:p-0">
          <div className="flex w-full min-w-0 flex-col gap-6 lg:max-w-[440px]">
            <StepProgress current={stepNumber} total={ONBOARDING_STEPS.length} />

            <div
              key={step}
              className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-2 duration-200 motion-reduce:animate-none"
            >
              {step === "source" ? (
                <ChoiceStep
                  headingRef={headingRef}
                  title={t("source.title")}
                  subtitle={t("source.subtitle")}
                  name="source"
                  columns={2}
                  value={source}
                  disabled={sourceSaved.current || pending}
                  options={SIGNUP_SOURCES.map((value) => ({
                    value,
                    label: t(`source.options.${value}`),
                  }))}
                  onChange={setSource}
                  onSubmit={() => answerSource(source ?? "skipped")}
                  footer={
                    <StepActions
                      pending={pending}
                      canContinue={source !== null || sourceSaved.current}
                      onSkip={sourceSaved.current ? undefined : () => answerSource("skipped")}
                      continueLabel={t("continue")}
                      skipLabel={t("skip")}
                    />
                  }
                />
              ) : null}

              {step === "use_case" ? (
                <ChoiceStep
                  headingRef={headingRef}
                  title={t("useCase.title")}
                  subtitle={t("useCase.subtitle")}
                  name="use_case"
                  columns={1}
                  value={useCase}
                  disabled={pending}
                  options={USE_CASES.map((value) => ({
                    value,
                    label: t(`useCase.options.${value}`),
                    icon: USE_CASE_ICONS[value],
                  }))}
                  onChange={setUseCase}
                  onSubmit={() => useCase && answerUseCase(useCase)}
                  footer={
                    <StepActions
                      pending={pending}
                      canContinue={useCase !== null}
                      onBack={() => go("source")}
                      onSkip={() => answerUseCase("skipped")}
                      backLabel={t("back")}
                      continueLabel={t("continue")}
                      skipLabel={t("skip")}
                    />
                  }
                />
              ) : null}

              {step === "agent" ? (
                <AgentStep
                  origin={origin}
                  heading={
                    <StepHeading
                      headingRef={headingRef}
                      title={t("agent.title")}
                      subtitle={t("agent.subtitle")}
                    />
                  }
                  client={client}
                  onClientChange={(next) => {
                    setClient(next)
                    track("onboarding_agent_client_selected", { client: next })
                  }}
                  onSetupUsed={onCopy}
                  onBack={() => go("use_case")}
                  onFinish={completeAgentStep}
                />
              ) : null}

              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
          </div>
        </main>
      </div>

      <aside
        aria-hidden
        className="dark relative hidden w-2/5 overflow-hidden border-l border-border bg-sidebar lg:block"
      >
        <LifeField />
      </aside>
    </div>
  )
}

function StepProgress({ current, total }: { current: number; total: number }) {
  const t = useTranslations("Onboarding")
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] leading-[18px] text-muted-foreground tabular-nums">
        {t("progress", { current, total })}
      </p>
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn(
              "rounded-sm h-1 flex-1 bg-border transition-colors duration-300 motion-reduce:transition-none",
              i < current && "bg-primary",
            )}
          />
        ))}
      </div>
    </div>
  )
}

function StepHeading({
  headingRef,
  title,
  subtitle,
}: {
  headingRef: React.RefObject<HTMLHeadingElement | null>
  title: string
  subtitle: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <h1
        id="onboarding-title"
        ref={headingRef}
        tabIndex={-1}
        className="font-heading text-[30px] leading-9 font-bold tracking-[-0.02em] outline-none"
      >
        {title}
      </h1>
      <p className="text-base leading-[26px] text-muted-foreground">{subtitle}</p>
    </div>
  )
}

// One question with a list of answers: native radios, so arrow keys move between them and Enter
// submits. Picking an answer doesn't advance by itself, which keeps arrow keys safe to use.
function ChoiceStep<Value extends string>({
  headingRef,
  title,
  subtitle,
  name,
  columns,
  value,
  disabled,
  options,
  onChange,
  onSubmit,
  footer,
}: {
  headingRef: React.RefObject<HTMLHeadingElement | null>
  title: string
  subtitle: string
  name: string
  columns: 1 | 2
  value: Value | null
  disabled: boolean
  options: { value: Value; label: string; icon?: React.ComponentType<{ className?: string }> }[]
  onChange: (value: Value) => void
  onSubmit: () => void
  footer: React.ReactNode
}) {
  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <StepHeading headingRef={headingRef} title={title} subtitle={subtitle} />
      <fieldset
        aria-labelledby="onboarding-title"
        className={cn("grid gap-2", columns === 2 && "sm:grid-cols-2")}
      >
        {options.map((option) => {
          const Icon = option.icon
          return (
            <label
              key={option.value}
              className={cn(
                "rounded-lg flex min-h-12 min-w-0 cursor-pointer items-center gap-3 border border-border bg-background px-4 py-3 text-sm leading-5 font-medium transition-colors hover:bg-muted",
                "has-checked:border-primary has-checked:bg-muted has-checked:ring-1 has-checked:ring-primary",
                "has-focus-visible:ring-3 has-focus-visible:ring-ring/30",
                "has-disabled:cursor-default has-disabled:hover:bg-background has-[:disabled:checked]:hover:bg-muted",
              )}
            >
              {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" /> : null}
              <span className="min-w-0 flex-1">{option.label}</span>
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={value === option.value}
                disabled={disabled && value !== option.value}
                onChange={() => onChange(option.value)}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className="rounded-sm size-4 shrink-0 border border-input bg-background peer-checked:border-[5px] peer-checked:border-primary"
              />
            </label>
          )
        })}
      </fieldset>
      {footer}
    </form>
  )
}

// Back on the left, Skip and Continue on the right. On phones the row becomes a bar fixed to the
// bottom edge, like the other screens with their own primary action.
function StepActions({
  pending,
  canContinue,
  onBack,
  onSkip,
  backLabel,
  continueLabel,
  skipLabel,
}: {
  pending: boolean
  canContinue: boolean
  onBack?: () => void
  onSkip?: () => void
  backLabel?: string
  continueLabel: string
  skipLabel: string
}) {
  return (
    <div className="flex items-center gap-2 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:min-h-14 max-lg:border-t max-lg:border-border max-lg:bg-background max-lg:px-4 max-lg:pt-2 max-lg:pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {onBack ? (
        <Button
          type="button"
          variant="ghost"
          size="lg"
          className="max-lg:h-10"
          disabled={pending}
          onClick={onBack}
        >
          <ArrowLeftIcon />
          {backLabel}
        </Button>
      ) : null}
      <div className="ml-auto flex items-center gap-2">
        {onSkip ? (
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="max-lg:h-10"
            disabled={pending}
            onClick={onSkip}
          >
            {skipLabel}
          </Button>
        ) : null}
        <Button
          type="submit"
          size="lg"
          className="max-lg:h-[38px]"
          loading={pending}
          disabled={!canContinue}
        >
          {continueLabel}
        </Button>
      </div>
    </div>
  )
}
