import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { WelcomeWizard } from "@/components/onboarding/welcome-wizard"
import { requireSession } from "@/lib/auth"
import { isSignupSourceAnswer, isUseCase, type OnboardingStep } from "@/lib/onboarding"
import { canOnboard, getOnboardingAnswers } from "@/lib/onboarding-server"
import { getAppOrigin, getRequestOrigin } from "@/lib/site"

export async function generateMetadata() {
  const t = await getTranslations("Onboarding")
  return { title: `${t("pageTitle")} · Sniptide`, robots: { index: false } }
}

// The welcome wizard. New accounts arrive here from the dashboard; a reload resumes at the first
// unanswered step, and older accounts go straight back to the dashboard.
export default async function Page() {
  const session = await requireSession()
  if (!canOnboard(session.user)) redirect("/dashboard")

  const [answers, origin] = await Promise.all([
    getOnboardingAnswers(session.user.id),
    // The MCP server lives with the app, not on the share-link domain.
    getAppOrigin() || getRequestOrigin().then(({ origin }) => origin),
  ])
  const source =
    answers && isSignupSourceAnswer(answers.source) && answers.source !== "skipped"
      ? answers.source
      : null
  const useCase = answers && isUseCase(answers.useCase) ? answers.useCase : null
  const step: OnboardingStep = !answers ? "source" : useCase ? "agent" : "use_case"

  return (
    <WelcomeWizard
      origin={origin}
      initialStep={step}
      initialSource={source}
      initialUseCase={useCase}
    />
  )
}
