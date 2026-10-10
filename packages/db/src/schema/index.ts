import { authRelations } from "./auth"

export * from "./auth"
export * from "./collections"
export * from "./pastes"
export * from "./rate-limit"

export const relations = { ...authRelations }
