import { Skeleton } from "@sniptide/ui/components/skeleton"
import Link from "next/link"
import { getLocale, getTranslations } from "next-intl/server"
import { getAccountTotals } from "@/lib/account/usage"
import { formatBytes } from "@/lib/format"
import { accountBudget } from "@/lib/pastes/budget"
import { SettingsSection } from "./section"
import { UsageMeters, type UsageMetric } from "./usage-meters"

const linkClass = "font-medium text-link outline-none hover:underline focus-visible:underline"

// The plan states the limits the server enforces, and the meters below read the same counters
// as the Usage tab, so both tabs agree on what is used and what is left.
export async function BillingSection({ ownerId }: { ownerId: string }) {
  const [t, locale] = await Promise.all([getTranslations("Settings"), getLocale()])
  const budget = accountBudget()
  const bytes = (value: number) => formatBytes(value, locale)
  const number = new Intl.NumberFormat(locale)
  const limits =
    budget.bytes !== null && budget.pastes !== null
      ? t("planLimits", { storage: bytes(budget.bytes), pastes: budget.pastes })
      : budget.bytes !== null
        ? t("planStorageLimit", { storage: bytes(budget.bytes) })
        : budget.pastes !== null
          ? t("planPasteLimit", { pastes: budget.pastes })
          : t("planUnlimited")
  let metrics: UsageMetric[] | null = null
  try {
    const totals = await getAccountTotals(ownerId)
    metrics = [
      { label: t("storage"), used: totals.storageBytes, limit: budget.bytes, format: bytes },
      {
        label: t("usagePastes"),
        used: totals.pasteCount,
        limit: budget.pastes,
        format: (value) => number.format(value),
      },
    ]
  } catch (error) {
    console.error("Unable to read account usage", error)
  }
  return (
    <SettingsSection title={t("plan")} description={t("sniptideIsFreeWhileItS")}>
      <div className="rounded-lg flex flex-col gap-1 border border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-medium">{t("free")}</span>
          <span className="text-[13px] text-muted-foreground">{limits}</span>
        </div>
        <span className="text-xs text-muted-foreground">{t("noPaymentMethodNeeded")}</span>
      </div>
      {metrics ? (
        <>
          <UsageMeters metrics={metrics} />
          <Link href="/settings?tab=usage" className={`w-fit text-sm ${linkClass}`}>
            {t("planViewUsage")}
          </Link>
        </>
      ) : (
        <p role="alert" className="text-sm text-muted-foreground">
          {t("usageUnavailable")}{" "}
          <a className={linkClass} href="/settings?tab=billing">
            {t("usageReload")}
          </a>
        </p>
      )}
    </SettingsSection>
  )
}

export async function BillingSectionSkeleton() {
  const t = await getTranslations("Settings")
  return (
    <div role="status" aria-busy="true">
      <SettingsSection title={t("plan")} description={t("sniptideIsFreeWhileItS")}>
        <Skeleton className="h-[74px] rounded-lg" />
        <Skeleton className="h-[156px] rounded-lg" />
      </SettingsSection>
      <span className="sr-only">{t("usageLoading")}</span>
    </div>
  )
}
