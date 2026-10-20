import { createHmac } from "node:crypto"

// The one account every visitor of a demo instance (DEMO_MODE) is signed in to.
export const DEMO_USER_ID = "demo-guest"
export const DEMO_EMAIL = "guest@demo.sniptide.invalid"
export const DEMO_NAME = "Guest"
export const DEMO_USERNAME = "guest"

// The guest's password is derived from the auth secret rather than stored or published, so it
// can't be guessed and nothing has to be configured. Only the server ever signs in with it.
export function demoPassword(secret: string) {
  return createHmac("sha256", secret).update("sniptide-demo-guest").digest("hex")
}
