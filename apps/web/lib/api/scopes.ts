export const SCOPES = ["read", "write"] as const
export type Scope = (typeof SCOPES)[number]
