import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2"
import type { Database } from "@workspace/db"
import * as schema from "@workspace/db/schema"
import { type BetterAuthOptions, type BetterAuthPlugin, betterAuth } from "better-auth"
import { APIError, createAuthMiddleware } from "better-auth/api"
import { username } from "better-auth/plugins/username"
import { assertAllowed, assertSignUpOpen, parseAllowlist } from "./allowlist"
import { DEMO_LOCKED_MESSAGE, DEMO_LOCKED_PATHS } from "./demo"
import { boundUserFields } from "./user-fields"
import { USERNAME_PATTERN } from "./username"

export interface OAuthCredentials {
  clientId: string
  clientSecret: string
}

export interface AuthConfig {
  db: Database
  secret: string
  baseURL?: string
  trustedOrigins?: string
  // Domain to share the session cookie across subdomains (sniptide.com for app.sniptide.com and
  // the landing page). Leave unset to keep the cookie on the app's own host.
  cookieDomain?: string
  // Prefix for Better Auth's cookie names (`<prefix>.session_token`), "better-auth" when unset.
  // Give each deployment that shares a cookie domain with another its own, so one deployment's
  // session cookie is never read by another that can't verify it.
  cookiePrefix?: string
  // Request headers that name the client's IP for rate limiting, most trusted first.
  ipAddressHeaders?: string[]
  // Better Auth turns its rate limits on in production only unless told otherwise.
  rateLimitEnabled?: boolean
  // False closes sign-up for everyone, whatever allowedEmails says. Existing accounts keep
  // signing in. Defaults to open.
  allowSignUp?: boolean
  // Comma-separated emails that may create an account. Unset or empty leaves sign-up open.
  allowedEmails?: string
  // True on a public demo instance (DEMO_MODE): everyone shares one guest account, so the calls
  // that would change or remove its sign-in details are refused.
  demo?: boolean
  // Providers without credentials are left out, so the sign-in page can hide or disable them.
  github?: OAuthCredentials
  google?: OAuthCredentials
  // True makes GitHub and Google create accounts only from the sign-up page (requestSignUp), so a
  // new visitor can't skip what sign-up asks for, such as the age confirmation, through sign-in.
  explicitSocialSignUp?: boolean
  emailVerification?: Pick<
    NonNullable<BetterAuthOptions["emailVerification"]>,
    "sendVerificationEmail"
  >
  // The three senders below need an email transport. Without one, password reset is off and an
  // email change applies at once (no address is verified then, so there's nothing to confirm).
  sendResetPassword?: NonNullable<BetterAuthOptions["emailAndPassword"]>["sendResetPassword"]
  // Asks the current, verified address to approve a change before the new one is verified.
  sendChangeEmailConfirmation?: NonNullable<
    NonNullable<BetterAuthOptions["user"]>["changeEmail"]
  >["sendChangeEmailConfirmation"]
  // Where GitHub and Google sign-in failures land, with the reason as ?error=<code>.
  errorURL?: string
  plugins?: BetterAuthPlugin[]
}

export function createAuth({
  db,
  secret,
  baseURL,
  trustedOrigins,
  cookieDomain,
  cookiePrefix,
  ipAddressHeaders,
  rateLimitEnabled,
  allowSignUp = true,
  allowedEmails,
  demo = false,
  github,
  google,
  explicitSocialSignUp = false,
  emailVerification,
  sendResetPassword,
  sendChangeEmailConfirmation,
  errorURL,
  plugins = [],
}: AuthConfig) {
  const allowlist = parseAllowlist(allowedEmails)

  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema }),
    secret,
    baseURL,
    trustedOrigins: trustedOrigins
      ?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    advanced: {
      ...(ipAddressHeaders?.length ? { ipAddress: { ipAddressHeaders } } : {}),
      ...(cookiePrefix ? { cookiePrefix } : {}),
      ...(cookieDomain ? { crossSubDomainCookies: { enabled: true, domain: cookieDomain } } : {}),
    },
    // In Postgres rather than memory, so limits hold across restarts and deploys.
    rateLimit: { enabled: rateLimitEnabled, storage: "database", modelName: "authRateLimit" },
    emailVerification: emailVerification && {
      ...emailVerification,
      sendOnSignUp: Boolean(allowlist),
      autoSignInAfterVerification: true,
    },
    emailAndPassword: {
      enabled: true,
      autoSignIn: !allowlist,
      sendResetPassword,
      // Whoever reset the password gets the only session; a stolen session ends with it.
      revokeSessionsOnPasswordReset: true,
    },
    account: {
      accountLinking: {
        // Linking from Settings happens while signed in, so the GitHub or Google account may use
        // another address than the Sniptide one. Sign-in still links only matching, verified
        // emails on its own.
        allowDifferentEmails: true,
      },
    },
    ...(errorURL ? { onAPIError: { errorURL } } : {}),
    user: {
      additionalFields: {
        // Settings page preferences as JSON; parsed and validated in the web app.
        preferences: { type: "string", required: false, input: true },
        pendingInvitation: {
          type: "boolean",
          required: false,
          defaultValue: false,
          input: false,
          returned: false,
        },
      },
      changeEmail: {
        enabled: true,
        updateEmailWithoutVerification: !emailVerification?.sendVerificationEmail && !allowlist,
        sendChangeEmailConfirmation,
      },
      deleteUser: { enabled: true },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (demo && DEMO_LOCKED_PATHS.has(ctx.path))
          throw new APIError("FORBIDDEN", { message: DEMO_LOCKED_MESSAGE })
        if (ctx.path === "/sign-up/email") {
          assertSignUpOpen(allowSignUp)
          assertAllowed(allowlist, ctx.body?.email)
          if (allowlist && !emailVerification?.sendVerificationEmail)
            throw new APIError("FORBIDDEN", {
              code: "EMAIL_VERIFICATION_UNAVAILABLE",
              message: "Invited accounts need email verification. Contact the administrator.",
            })
        }
      }),
    },
    databaseHooks: {
      user: {
        // Covers email sign-up and the first GitHub or Google sign-in alike.
        create: {
          before: async (user) => {
            assertSignUpOpen(allowSignUp)
            assertAllowed(allowlist, user.email)
            const pendingInvitation = Boolean(allowlist && user.emailVerified !== true)
            if (pendingInvitation && !emailVerification?.sendVerificationEmail)
              throw new APIError("FORBIDDEN", {
                code: "EMAIL_VERIFICATION_UNAVAILABLE",
                message: "Invited accounts need email verification. Contact the administrator.",
              })
            return { data: { ...boundUserFields(user, "create"), pendingInvitation } }
          },
        },
        update: {
          before: async (user) => ({
            data: {
              ...boundUserFields(user, "update"),
              ...(user.emailVerified === true ? { pendingInvitation: false } : {}),
            },
          }),
        },
      },
      session: {
        create: {
          before: async (session) => {
            const user = await db.query.user.findFirst({
              columns: {
                pendingInvitation: true,
                emailVerified: true,
              },
              where: { id: session.userId },
            })
            if (user?.pendingInvitation && user.emailVerified !== true)
              throw new APIError("FORBIDDEN", {
                code: "EMAIL_NOT_VERIFIED",
                message: "Verify your email before signing in.",
              })
          },
        },
      },
    },
    socialProviders: {
      ...(github ? { github: { ...github, disableImplicitSignUp: explicitSocialSignUp } } : {}),
      ...(google ? { google: { ...google, disableImplicitSignUp: explicitSocialSignUp } } : {}),
    },
    plugins: [
      username({
        minUsernameLength: 3,
        maxUsernameLength: 30,
        usernameValidator: (value) => USERNAME_PATTERN.test(value),
      }),
      ...plugins,
    ],
  })
}

export type Auth = ReturnType<typeof createAuth>
export type Session = Auth["$Infer"]["Session"]
