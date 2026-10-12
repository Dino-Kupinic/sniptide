import { authRelations } from "./auth"

export * from "./analytics"
export * from "./auth"
export * from "./collections"
export * from "./folders"
export * from "./pastes"
export * from "./rate-limit"

export const relations = { ...authRelations }
