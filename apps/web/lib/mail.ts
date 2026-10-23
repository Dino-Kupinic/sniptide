import "server-only"

import net from "node:net"
import tls from "node:tls"
import nodemailer from "nodemailer"
import type Mail from "nodemailer/lib/mailer"
import type { SMTPTransportOptions } from "nodemailer/lib/smtp-transport"
import { type Config, getConfig } from "@/lib/config"
import { hit } from "@/lib/rate-limit"
import { HOUR_SECONDS } from "@/lib/time"

export async function sendMail(smtp: NonNullable<Config["smtp"]>, message: Mail.Options) {
  let socket: net.Socket | undefined
  let timedOut = false
  const transport = nodemailer.createTransport({
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
      if (timedOut) {
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
      connection.once("error", (error) => {
        if (!connected) callback(error, {})
      })
    },
  } satisfies SMTPTransportOptions)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      transport.sendMail(message),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          timedOut = true
          socket?.destroy(new Error("Delivery deadline exceeded"))
          reject(new Error("Delivery deadline exceeded"))
        }, 30_000)
      }),
    ])
  } finally {
    clearTimeout(timer)
    socket?.destroy()
    transport.close()
  }
}

// Verifies an address: on request from Settings, and for the new address after an email change.
export async function sendEmailVerification({
  user,
  url,
}: {
  user: { id: string; email: string }
  url: string
}) {
  const smtp = getConfig().smtp
  if (!smtp) throw new Error("Email delivery is not configured.")
  const allowance = await hit([
    { key: `email:verification:${user.id}`, max: 3, windowSeconds: HOUR_SECONDS },
  ])
  if (!allowance.allowed)
    throw new Error("Please wait before requesting another verification email.")
  await sendMail(smtp, {
    from: smtp.from,
    to: user.email,
    subject: "Verify your Sniptide email",
    text: `Open this link to confirm that this address belongs to your Sniptide account:\n\n${url}\n\nIf you did not request this email, you can ignore it.`,
  })
}

// Sent to the current, verified address before an email change. Approving it sends a
// verification link to the new address.
export async function sendEmailChangeConfirmation({
  user,
  newEmail,
  url,
}: {
  user: { id: string; email: string }
  newEmail: string
  url: string
}) {
  const smtp = getConfig().smtp
  if (!smtp) throw new Error("Email delivery is not configured.")
  const allowance = await hit([
    { key: `email:change:${user.id}`, max: 3, windowSeconds: HOUR_SECONDS },
  ])
  if (!allowance.allowed) throw new Error("Please wait before changing your email again.")
  await sendMail(smtp, {
    from: smtp.from,
    to: user.email,
    subject: "Approve your Sniptide email change",
    text: `Someone asked to change the email of your Sniptide account to ${newEmail}. Open this link to approve it, and we'll send a verification link to the new address:\n\n${url}\n\nIf you didn't ask for this, ignore this email and change your password.`,
  })
}

// Password reset links go out in the background and failures are only logged, so the response
// to "forgot password" takes the same time and says the same thing whether the account exists.
export async function sendPasswordReset({
  user,
  url,
}: {
  user: { id: string; email: string }
  url: string
}) {
  const smtp = getConfig().smtp
  if (!smtp) return
  void (async () => {
    const allowance = await hit([
      { key: `email:reset:${user.id}`, max: 3, windowSeconds: HOUR_SECONDS },
    ])
    if (!allowance.allowed) return
    await sendMail(smtp, {
      from: smtp.from,
      to: user.email,
      subject: "Reset your Sniptide password",
      text: `Open this link to choose a new password for your Sniptide account. It works once, for one hour:\n\n${url}\n\nChanging your password signs you out on every device. If you didn't ask for this, you can ignore this email.`,
    })
  })().catch((error) => console.error("Password reset email failed", error))
}
