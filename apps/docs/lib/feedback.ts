// The four answers to "Was this helpful?", from worst to best, with the score sent to PostHog so
// pages can be averaged and compared.
export const ratings = ["terrible", "bad", "good", "great"] as const
export type Rating = (typeof ratings)[number]

export type Feedback = { rating: Rating; path: string; locale: string }

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com"

// PostHog settings, read when a request arrives, so one image can serve any project. Without
// POSTHOG_KEY the answers are accepted and dropped.
export function posthogConfig() {
  const key = process.env.POSTHOG_KEY?.trim()
  if (!key) return null
  const host = (process.env.POSTHOG_HOST?.trim() || DEFAULT_POSTHOG_HOST).replace(/\/+$/, "")
  return { key, host }
}

// One anonymous docs_feedback event. A fresh id per answer and no person profile, so an answer
// can't be tied to a reader or to their other answers.
export function feedbackEvent(feedback: Feedback, key: string, distinctId: string) {
  return {
    api_key: key,
    event: "docs_feedback",
    distinct_id: distinctId,
    properties: {
      surface: "docs",
      path: feedback.path,
      locale: feedback.locale,
      rating: feedback.rating,
      score: ratings.indexOf(feedback.rating) + 1,
      $process_person_profile: false,
    },
  }
}
