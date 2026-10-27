import { Progress } from "@sniptide/ui/components/progress"
import { AlertCircleIcon, AlertTriangleIcon } from "lucide-react"
import { getLocale, getTranslations } from "next-intl/server"
import { getAccountUsage, USAGE_HISTORY_DAYS } from "@/lib/account/usage"
import { usageHistory, usageLimitState } from "@/lib/account/usage-display"
import { formatBytes } from "@/lib/format"
import { accountBudget } from "@/lib/pastes/budget"
import { DAY } from "@/lib/time"
import { SettingsSection } from "./section"

export async function UsageSection({ ownerId }: { ownerId: string }) {
  const [t, locale] = await Promise.all([getTranslations("Settings"), getLocale()])
  const now = new Date()
  let usage: Awaited<ReturnType<typeof getAccountUsage>>
  try {
    usage = await getAccountUsage(ownerId, now)
  } catch (error) {
    console.error("Unable to read account usage", error)
    return (
      <SettingsSection title={t("usage")}>
        <p role="alert" className="text-sm text-muted-foreground">
          {t("usageUnavailable")}{" "}
          <a className="text-link underline" href="/settings?tab=usage">
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
  const date = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
  const formatDate = (value: string) => date.format(new Date(`${value}T00:00:00Z`))
  const metrics = [
    {
      label: t("storage"),
      displayLimit: true,
      used: usage.storageBytes,
      limit: budget.bytes,
      format: (value: number) => formatBytes(value, locale),
    },
    {
      label: t("usagePastes"),
      displayLimit: true,
      used: usage.pasteCount,
      limit: budget.pastes,
      format: (value: number) => number.format(value),
    },
    {
      label: t("collections"),
      displayLimit: false,
      used: usage.collectionCount,
      limit: null,
      format: (value: number) => number.format(value),
    },
    {
      label: t("usageFiles"),
      displayLimit: false,
      used: usage.fileCount,
      limit: null,
      format: (value: number) => number.format(value),
    },
  ]
  const max = Math.max(1, ...history.days.map((day) => day.requests))
  return (
    <>
      <SettingsSection title={t("usage")} description={t("usageDescription")} repeatsHeading>
        <div className="grid grid-cols-2 gap-3">
          {metrics.map((metric) => {
            const state = usageLimitState(metric.used, metric.limit)
            const limited = state.kind === "limited"
            return (
              <div
                key={metric.label}
                className="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-4"
              >
                <span className="text-sm text-muted-foreground">{metric.label}</span>
                <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
                  <span className="text-xl font-semibold tabular-nums">
                    {metric.format(metric.used)}
                  </span>
                  {metric.displayLimit ? (
                    <span className="text-xs text-muted-foreground">
                      {metric.limit !== null
                        ? t("usageOfLimit", { limit: metric.format(metric.limit) })
                        : t("usageUnlimited")}
                    </span>
                  ) : null}
                </div>
                {limited ? (
                  <>
                    <Progress
                      value={state.percent}
                      aria-label={metric.label}
                      className={
                        state.status === "full"
                          ? "[&>*>*]:bg-destructive"
                          : state.status === "warning"
                            ? "[&>*>*]:bg-amber-600"
                            : undefined
                      }
                    />
                    {state.status !== "normal" ? (
                      <p
                        className={
                          state.status === "full"
                            ? "flex items-center gap-1 text-xs text-destructive"
                            : "flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"
                        }
                      >
                        {state.status === "full" ? (
                          <AlertCircleIcon aria-hidden="true" className="size-3.5" />
                        ) : (
                          <AlertTriangleIcon aria-hidden="true" className="size-3.5" />
                        )}
                        {t(state.status === "full" ? "usageFull" : "usageWarning")}
                      </p>
                    ) : null}
                  </>
                ) : null}
              </div>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">{t("usageIncludesTrash")}</p>
      </SettingsSection>
      <SettingsSection title={t("usageApiRequests")} description={t("usageHistoryDescription")}>
        <div className="rounded-lg border border-border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-2xl font-semibold tabular-nums">{number.format(history.total)}</p>
              <p className="text-xs text-muted-foreground">{t("usageRequestsTotal")}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              {formatDate(history.days[0]?.date ?? now.toISOString().slice(0, 10))} –{" "}
              {formatDate(
                history.days[history.days.length - 1]?.date ?? now.toISOString().slice(0, 10),
              )}{" "}
              · UTC
            </p>
          </div>
          {history.total === 0 ? (
            <p className="mt-5 text-sm text-muted-foreground">{t("usageNoRequests")}</p>
          ) : (
            <div aria-hidden="true" className="mt-5 flex h-20 items-end gap-0.5">
              {history.days.map((day) => (
                <div
                  key={day.date}
                  className="min-w-0 flex-1 rounded-t-sm bg-primary/70"
                  style={{ height: `${(day.requests / max) * 100}%` }}
                />
              ))}
            </div>
          )}
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-link">{t("usageDailyValues")}</summary>
            <table className="mt-3 w-full text-left text-xs">
              <thead>
                <tr>
                  <th className="pb-2 font-medium">{t("usageDateUtc")}</th>
                  <th className="pb-2 text-right font-medium">{t("usageApiRequests")}</th>
                </tr>
              </thead>
              <tbody>
                {history.days.map((day) => (
                  <tr key={day.date} className="border-t border-border">
                    <td className="py-1.5">{formatDate(day.date)}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {number.format(day.requests)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      </SettingsSection>
    </>
  )
}

export async function UsageSectionSkeleton() {
  const t = await getTranslations("Settings")
  return (
    <div role="status" aria-busy="true" className="py-6">
      <span className="sr-only">{t("usageLoading")}</span>
      <div aria-hidden="true" className="max-w-[560px] space-y-5">
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-28 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
        <div className="h-40 animate-pulse rounded-lg bg-muted" />
      </div>
    </div>
  )
}
