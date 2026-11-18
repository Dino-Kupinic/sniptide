import { authRelations } from "./auth"

export * from "./abuse"
export * from "./acquisition"
export * from "./activity"
export * from "./analytics"
export * from "./auth"
export * from "./collections"
export * from "./env"
export * from "./highlight"
export * from "./idempotency"
export * from "./notifications"
export * from "./oauth"
export * from "./pastes"
export * from "./rate-limit"
export * from "./tokens"
export * from "./usage"

export const relations = { ...authRelations }
