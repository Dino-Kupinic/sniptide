import { Skeleton } from "@sniptide/ui/components/skeleton"
import Link from "next/link"
import { getLocale, getTranslations } from "next-intl/server"
import { ViewsBarChart } from "@/components/dashboard/views-chart"
import type { Allowance } from "@/lib/account/allowances"
import { getAccountUsage, USAGE_HISTORY_DAYS } from "@/lib/account/usage"
import { type AllowanceId, usageHistory } from "@/lib/account/usage-display"
import { formatBytes } from "@/lib/format"
import { accountBudget } from "@/lib/pastes/budget"
import { DAY } from "@/lib/time"
import { SettingsSection } from "./section"
import { UsageMeters, type UsageMetric } from "./usage-meters"

// Usage from the account reader: one panel of counts, with a meter under each count that has a
// quota, one panel of the allowances that refill each hour or day, and the last 30 UTC days of API
// requests as a bar chart over a table of daily values.
export async function UsageSection({ ownerId }: { ownerId: string }) {
  const [t, locale] = await Promise.all([getTranslations("Settings"), getLocale()])
  const now = new Date()
  let usage: Awaited<ReturnType<typeof getAccountUsage>>
  try {
    usage = await getAccountUsage(ownerId, now)
  } catch (error) {
    console.error("Unable to read account usage", error)
    return (
      <SettingsSection title={t("usage")} repeatsHeading>
        <p role="alert" className="text-sm text-muted-foreground">
          {t("usageUnavailable")}{" "}
          <a
            className="font-medium text-link outline-none hover:underline focus-visible:underline"
            href="/settings?tab=usage"
          >
            {t("usageReload")}
          </a>
        </p>
      </SettingsSection>
    )
  }
  const budget = accountBudget()
  const history = usageHistory(
    usage.apiRequests,
    Math.floor(now.getTime() / DAY),
    USAGE_HISTORY_DAYS,
  )
  const number = new Intl.NumberFormat(locale)
  const fullDate = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
  const shortDate = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
  const utc = (value: string) => new Date(`${value}T00:00:00Z`)
  const first = history.days[0]?.date ?? now.toISOString().slice(0, 10)
  const last = history.days[history.days.length - 1]?.date ?? first
  const metrics: UsageMetric[] = [
    {
      label: t("storage"),
      used: usage.storageBytes,
      limit: budget.bytes,
      format: (value: number) => formatBytes(value, locale),
    },
    {
      label: t("usagePastes"),
      used: usage.pasteCount,
      limit: budget.pastes,
      format: (value: number) => number.format(value),
    },
    {
      label: t("collections"),
      used: usage.collectionCount,
      limit: null,
      format: (value: number) => number.format(value),
    },
    {
      label: t("usageFiles"),
      used: usage.fileCount,
      limit: null,
      format: (value: number) => number.format(value),
    },
    {
      label: t("usageApiTokens"),
      used: usage.apiTokenCount,
      limit: null,
      format: (value: number) => number.format(value),
    },
    {
      label: t("usageConnectedAgents"),
      used: usage.connectedAgentCount,
      limit: null,
      format: (value: number) => number.format(value),
    },
    {
      label: t("envGroups"),
      used: usage.envGroupCount,
      limit: null,
      format: (value: number) => number.format(value),
    },
  ]
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "always" })
  const refill = (allowance: Allowance) => {
    const window = t(allowance.windowSeconds >= 86_400 ? "usagePerDay" : "usagePerHour")
    if (allowance.resetSeconds === null) return window
    const minutes = Math.ceil(allowance.resetSeconds / 60)
    const when =
      minutes < 60
        ? relative.format(minutes, "minute")
        : relative.format(Math.ceil(minutes / 60), "hour")
    return t("usageRefills", { window, when })
  }
  const allowanceLabels: Record<AllowanceId, string> = {
    pasteCreates: t("usagePasteCreates"),
    pasteEdits: t("usagePasteEdits"),
    gistImports: t("usageGistImports"),
    webhookShares: t("usageWebhookShares"),
    secretLinks: t("usageSecretLinks"),
    tokenCreates: t("usageTokenCreates"),
    apiRequests: t("usageApiRequestsPerToken"),
    assistantQuestions: t("usageAssistantQuestions"),
    reports: t("usageReports"),
  }
  const allowances: UsageMetric[] = usage.allowances.map((allowance) => ({
    label: allowanceLabels[allowance.id],
    used: allowance.used,
    limit: allowance.limit,
    format: (value: number) => number.format(value),
    note: refill(allowance),
  }))
  return (
    <>
      <SettingsSection title={t("usage")} description={t("usageDescription")} repeatsHeading>
        <UsageMeters metrics={metrics} />
      </SettingsSection>
      <SettingsSection title={t("usageRateLimits")} description={t("usageRateLimitsDescription")}>
        <UsageMeters metrics={allowances} />
      </SettingsSection>
      <SettingsSection title={t("usageApiRequests")} description={t("usageHistoryDescription")}>
        {history.total === 0 ? (
          <div className="flex flex-col items-start gap-1 text-sm">
            <p className="text-muted-foreground">{t("usageNoRequests")}</p>
            <Link
              href="/settings?tab=api"
              className="font-medium text-link outline-none hover:underline focus-visible:underline"
            >
              {t("usageCreateToken")}
            </Link>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-0.5">
              <p className="font-heading text-3xl leading-9 font-bold tracking-[-0.02em] tabular-nums">
                {number.format(history.total)}
              </p>
              <p className="text-[13px] text-muted-foreground">
                {t("usageRequestsTotal", { range: fullDate.formatRange(utc(first), utc(last)) })}
              </p>
            </div>
            <ViewsBarChart
              values={history.days.map((day) => day.requests)}
              labels={history.days.map((day) => shortDate.format(utc(day.date)))}
              label={t("usageChartLabel", {
                values: history.days
                  .map((day) => `${shortDate.format(utc(day.date))} ${number.format(day.requests)}`)
                  .join(", "),
              })}
            />
            <details className="text-sm">
              <summary className="w-fit cursor-pointer font-medium text-link outline-none hover:underline focus-visible:underline">
                {t("usageDailyValues")}
              </summary>
              <table className="mt-3 w-full">
                <thead>
                  <tr className="text-[13px] text-muted-foreground">
                    <th className="pb-2 text-left font-medium">{t("usageDateUtc")}</th>
                    <th className="pb-2 text-right font-medium">{t("usageApiRequests")}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.days.map((day) => (
                    <tr key={day.date} className="border-t border-border">
                      <td className="py-2">{fullDate.format(utc(day.date))}</td>
                      <td className="py-2 text-right tabular-nums">
                        {number.format(day.requests)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        )}
      </SettingsSection>
    </>
  )
}

// Keeps the section titles in place while the counts load, so the panel fills in without a jump.
export async function UsageSectionSkeleton() {
  const t = await getTranslations("Settings")
  return (
    <div role="status" aria-busy="true">
      <SettingsSection title={t("usage")} description={t("usageDescription")} repeatsHeading>
        <Skeleton className="h-[373px] rounded-lg" />
      </SettingsSection>
      <SettingsSection title={t("usageRateLimits")} description={t("usageRateLimitsDescription")}>
        <Skeleton className="h-[611px] rounded-lg" />
      </SettingsSection>
      <SettingsSection title={t("usageApiRequests")} description={t("usageHistoryDescription")}>
        <Skeleton className="h-[248px] rounded-lg" />
      </SettingsSection>
      {/* After the sections, so the first one still drops its top border. */}
      <span className="sr-only">{t("usageLoading")}</span>
    </div>
  )
}
