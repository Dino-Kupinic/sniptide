import { authRelations } from "./auth"

export * from "./auth"
export * from "./pastes"

export const relations = { ...authRelations }
