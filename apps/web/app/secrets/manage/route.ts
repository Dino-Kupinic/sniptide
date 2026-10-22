import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { getSession } from "@/lib/auth"
import { boundedJson, secretJson } from "@/lib/env/http"
import { secretSaveSchema, secretShareSchema } from "@/lib/env/inputs"
import {
  createSecretShare,
  removeSecret,
  revealSecret,
  revokeSecretShare,
  saveSecret,
} from "@/lib/env/web-store"
import { hit } from "@/lib/rate-limit"
import { getSiteOrigin } from "@/lib/site"
import { seconds } from "@/lib/time"

const id = z.string().uuid()
const commandSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("save"), id: id.nullable(), input: secretSaveSchema }),
  z.object({
    operation: z.literal("reveal"),
    id,
    name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,255}$/),
  }),
  z.object({ operation: z.literal("delete"), id }),
  z.object({ operation: z.literal("share"), id, input: secretShareSchema }),
  z.object({ operation: z.literal("revoke"), id, shareId: id }),
])
export async function POST(request: Request) {
  const t = await getTranslations("Secrets")
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin)
      return secretJson({ error: t("refused_error") }, 403)
    const session = await getSession()
    if (!session) return secretJson({ error: t("sign_in_error") }, 401)
    const parsed = commandSchema.safeParse(await boundedJson(request, 2 * 1024 * 1024))
    if (!parsed.success) return secretJson({ error: t("fields_error") }, 400)
    const command = parsed.data
    const owner = session.user.id
    switch (command.operation) {
      case "save": {
        const result = await saveSecret(owner, command.id, command.input)
        if (result.status === "ok") return secretJson(result)
        return secretJson(
          {
            error:
              result.status === "conflict"
                ? t("conflict_error")
                : result.status === "duplicate"
                  ? t("duplicate_error")
                  : t("save_group_error"),
          },
          result.status === "conflict" ? 409 : 400,
        )
      }
      case "reveal": {
        const value = await revealSecret(owner, command.id, command.name)
        return value === null
          ? secretJson({ error: t("unavailable_error") }, 404)
          : secretJson({ value })
      }
      case "delete":
        return secretJson({ ok: await removeSecret(owner, command.id) })
      case "revoke":
        return secretJson({ ok: await revokeSecretShare(owner, command.id, command.shareId) })
      case "share": {
        const limit = await hit([
          { key: `secret-share-create:${owner}`, max: 20, windowSeconds: seconds(3600) },
        ])
        if (!limit.allowed) return secretJson({ error: t("retry_error") }, 429)
        const token = await createSecretShare(owner, command.id, command.input)
        return token
          ? secretJson({ url: `${(await getSiteOrigin()).origin}/secret-share/${token}` })
          : secretJson({ error: t("create_link_error") }, 400)
      }
    }
  } catch {
    return secretJson({ error: t("complete_error") }, 400)
  }
}
