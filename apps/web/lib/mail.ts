import "server-only"

import net from "node:net"
import tls from "node:tls"
import nodemailer from "nodemailer"
import type Mail from "nodemailer/lib/mailer"
import type { SMTPPoolOptions } from "nodemailer/lib/smtp-pool"
import { type Config, getConfig } from "@/lib/config"
import { approveEmailChange, resetPassword, verifyEmail } from "@/lib/email/content"
import { requestLocale } from "@/lib/email/locale"
import { renderEmail } from "@/lib/email/render"
import { hit } from "@/lib/rate-limit"
import { HOUR_SECONDS } from "@/lib/time"

function mailTransport(smtp: NonNullable<Config["smtp"]>) {
  let socket: net.Socket | undefined
  let closed = false
  const transport = nodemailer.createTransport({
    pool: true,
    maxConnections: 1,
    maxRequeues: 0,
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    requireTLS: smtp.requireTLS,
    auth: smtp.auth,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
    debug: false,
    getSocket(_options, callback) {
      if (closed) {
        callback(new Error("Delivery deadline exceeded"), {})
        return
      }
      const options = { host: smtp.host, port: smtp.port }
      const connection = smtp.secure
        ? tls.connect({ ...options, servername: net.isIP(smtp.host) ? undefined : smtp.host })
        : net.connect(options)
      socket = connection
      let connected = false
      connection.once(smtp.secure ? "secureConnect" : "connect", () => {
        connected = true
        callback(null, { connection, secured: smtp.secure })
      })
      connection.once("error", (error: Error) => {
        if (!connected) callback(error, {})
      })
    },
  } satisfies SMTPPoolOptions)
  return {
    transport,
    close() {
      closed = true
      socket?.destroy()
      transport.close()
    },
  }
}

export function createMailSender(smtp: NonNullable<Config["smtp"]>) {
  let current: ReturnType<typeof mailTransport> | undefined
  return {
    async send(message: Mail.Options) {
      current ??= mailTransport(smtp)
      const connection = current
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          connection.transport.sendMail(message),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
              connection.close()
              reject(new Error("Delivery deadline exceeded"))
            }, 30_000)
          }),
        ])
      } catch (error) {
        connection.close()
        if (current === connection) current = undefined
        throw error
      } finally {
        clearTimeout(timer)
      }
    },
    close() {
      current?.close()
      current = undefined
    },
  }
}

export async function sendMail(smtp: NonNullable<Config["smtp"]>, message: Mail.Options) {
  const sender = createMailSender(smtp)
  try {
    await sender.send(message)
  } finally {
    sender.close()
  }
}

// Verifies an address: on request from Settings, and for the new address after an email change.
export async function sendEmailVerification(
  {
    user,
    url,
  }: {
    user: { id: string; email: string }
    url: string
  },
  request?: Request,
) {
  const { smtp, legal, appUrl } = getConfig()
  if (!smtp) throw new Error("Email delivery is not configured.")
  const allowance = await hit([
    { key: `email:verification:${user.id}`, max: 3, windowSeconds: HOUR_SECONDS },
  ])
  if (!allowance.allowed)
    throw new Error("Please wait before requesting another verification email.")
  await sendMail(smtp, {
    from: smtp.from,
    to: user.email,
    ...(await renderEmail(
      verifyEmail({
        to: user.email,
        url,
        appUrl,
        operator: legal.operator,
        locale: await requestLocale(request),
      }),
    )),
  })
}

// Sent to the current, verified address before an email change. Approving it sends a
// verification link to the new address.
export async function sendEmailChangeConfirmation(
  {
    user,
    newEmail,
    url,
  }: {
    user: { id: string; email: string }
    newEmail: string
    url: string
  },
  request?: Request,
) {
  const { smtp, legal, appUrl } = getConfig()
  if (!smtp) throw new Error("Email delivery is not configured.")
  const allowance = await hit([
    { key: `email:change:${user.id}`, max: 3, windowSeconds: HOUR_SECONDS },
  ])
  if (!allowance.allowed) throw new Error("Please wait before changing your email again.")
  await sendMail(smtp, {
    from: smtp.from,
    to: user.email,
    ...(await renderEmail(
      approveEmailChange({
        to: user.email,
        newEmail,
        url,
        appUrl,
        operator: legal.operator,
        locale: await requestLocale(request),
      }),
    )),
  })
}

// Password reset links go out in the background and failures are only logged, so the response
// to "forgot password" takes the same time and says the same thing whether the account exists.
export async function sendPasswordReset(
  {
    user,
    url,
  }: {
    user: { id: string; email: string }
    url: string
  },
  request?: Request,
) {
  const { smtp, legal, appUrl } = getConfig()
  if (!smtp) return
  // Read before the background task, while the request is still in scope.
  const locale = await requestLocale(request)
  void (async () => {
    const allowance = await hit([
      { key: `email:reset:${user.id}`, max: 3, windowSeconds: HOUR_SECONDS },
    ])
    if (!allowance.allowed) return
    await sendMail(smtp, {
      from: smtp.from,
      to: user.email,
      ...(await renderEmail(
        resetPassword({ to: user.email, url, appUrl, operator: legal.operator, locale }),
      )),
    })
  })().catch((error) => console.error("Password reset email failed", error))
}
