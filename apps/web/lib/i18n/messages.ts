import type { AbstractIntlMessages } from "next-intl"
import type { Locale } from "./config"

export async function loadMessages(locale: Locale): Promise<AbstractIntlMessages> {
  const catalogs = await Promise.all([
    import(`../../messages/${locale}/core.json`),
    import(`../../messages/${locale}/workspace.json`),
    import(`../../messages/${locale}/paste.json`),
    import(`../../messages/${locale}/settings.json`),
    import(`../../messages/${locale}/auth.json`),
    import(`../../messages/${locale}/not-found.json`),
    import(`../../messages/${locale}/errors.json`),
    import(`../../messages/${locale}/legal.json`),
    import(`../../messages/${locale}/oauth.json`),
  ])
  return Object.assign({}, ...catalogs.map((catalog) => catalog.default))
}
