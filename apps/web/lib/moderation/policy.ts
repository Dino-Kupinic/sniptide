import type { TextVerdict } from "./providers"
import { SPAM_REVIEW_SCORE, type SpamVerdict } from "./spam"

// Bump when a threshold or a rule changes. Each result records the version that produced it.
export const POLICY_VERSION = "2026-11-26.1"

export type ReportCategory =
  | "child_exploitation"
  | "sexual_content"
  | "graphic_violence"
  | "malware"
  | "harassment"
  | "other"

export interface Finding {
  category: ReportCategory
  quarantine: boolean
  summary: string
}

// Starting thresholds, chosen to restrict only confident results and send everything else a
// provider flags to a person. They are tuned from the review queue's overturned decisions, not
// from the providers' examples. A flag is a signal for review, never a legal determination.
export const THRESHOLDS = {
  // Suspected child sexual abuse material is restricted at a low score and goes to the incident
  // procedure first, so a reviewer decides with the paste already out of public view.
  minors: 0.2,
  sexual: 0.8,
  graphic: 0.8,
}

const OPENAI_REVIEW: Record<string, ReportCategory> = {
  sexual: "sexual_content",
  "violence/graphic": "graphic_violence",
  violence: "graphic_violence",
  harassment: "harassment",
  "harassment/threatening": "harassment",
  hate: "harassment",
  "hate/threatening": "harassment",
  illicit: "other",
  "illicit/violent": "other",
  "self-harm": "other",
  "self-harm/intent": "other",
  "self-harm/instructions": "other",
}
const MISTRAL_REVIEW: Record<string, ReportCategory> = {
  sexual: "sexual_content",
  violence_and_threats: "graphic_violence",
  hate_and_discrimination: "harassment",
  dangerous_and_criminal_content: "other",
  selfharm: "other",
}

function score(verdict: TextVerdict, category: string) {
  return (verdict.scores[category] ?? 0).toFixed(2)
}

function textFindings(verdict: TextVerdict): Finding[] {
  const findings: Finding[] = []
  const flagged = new Set(verdict.flagged)
  const minors = verdict.scores["sexual/minors"] ?? 0
  if (flagged.has("sexual/minors") || minors >= THRESHOLDS.minors)
    findings.push({
      category: "child_exploitation",
      quarantine: true,
      summary: `sexual/minors ${score(verdict, "sexual/minors")}`,
    })
  const sexual = verdict.scores.sexual ?? 0
  if (sexual >= THRESHOLDS.sexual)
    findings.push({
      category: "sexual_content",
      quarantine: true,
      summary: `sexual ${score(verdict, "sexual")}`,
    })
  const graphic = verdict.scores["violence/graphic"] ?? 0
  if (verdict.provider === "openai" && graphic >= THRESHOLDS.graphic)
    findings.push({
      category: "graphic_violence",
      quarantine: true,
      summary: `violence/graphic ${score(verdict, "violence/graphic")}`,
    })
  const review = verdict.provider === "openai" ? OPENAI_REVIEW : MISTRAL_REVIEW
  const covered = new Set(findings.map((finding) => finding.category))
  for (const category of flagged) {
    const target = review[category]
    if (!target || covered.has(target)) continue
    covered.add(target)
    findings.push({
      category: target,
      quarantine: false,
      summary: `${category} ${score(verdict, category)}`,
    })
  }
  return findings
}

export function decide(input: {
  text: TextVerdict | null
  threats: string[]
  spam: SpamVerdict
}): Finding[] {
  const findings = input.text ? textFindings(input.text) : []
  if (input.threats.length)
    findings.push({
      category: "malware",
      quarantine: true,
      summary: `Web Risk: ${input.threats.join(", ")}`,
    })
  if (input.spam.score >= SPAM_REVIEW_SCORE) {
    const summary = `spam heuristics ${input.spam.score}: ${input.spam.reasons.join("; ")}`
    const other = findings.find((finding) => finding.category === "other")
    if (other) other.summary += `; ${summary}`
    else findings.push({ category: "other", quarantine: false, summary })
  }
  return findings
}

export function actionOf(findings: Finding[]) {
  if (findings.some((finding) => finding.quarantine)) return "quarantine" as const
  return findings.length ? ("review" as const) : ("none" as const)
}
