import "server-only"

import { seal, unseal } from "@/lib/sealed"

// Env values are encrypted before they reach Postgres (lib/sealed.ts). Changing ENV_SECRETS_KEY,
// or BETTER_AUTH_SECRET when that isn't set, makes stored values unreadable: push the env groups
// again afterwards.

const PURPOSE = "env-variables:v1"

// `context` is the group's id and the variable's name, so a value copied into another row or
// group fails to decrypt.
export function encryptValue(value: string, context: string) {
  return seal(value, context, PURPOSE)
}

export function decryptValue(stored: string, context: string) {
  return unseal(stored, context, PURPOSE)
}
