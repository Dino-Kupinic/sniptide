import { authRelations } from "./auth"

export * from "./analytics"
export * from "./auth"
export * from "./collections"
export * from "./env"
export * from "./pastes"
export * from "./rate-limit"
export * from "./tokens"

export const relations = { ...authRelations }
