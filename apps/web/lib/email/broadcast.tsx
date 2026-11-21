import type { ReactNode } from "react"
import { Button, Heading, Img, Link, Section, Text } from "react-email"
import { type Operator, senderLine } from "./content"
import { button, EmailFooter, EmailFrame, Padded, text } from "./layout"
import { fonts, light } from "./theme"

// Product update emails (release notes, announcements) sent as Resend Broadcasts. Each one is a
// file in emails/broadcasts that exports `subject`, `preview` and a default component built from
// the blocks below, so it previews in `bun run email` and sends with scripts/send-broadcast.ts.
// Broadcasts are written in English, because one segment holds every subscriber.

// Resend swaps this for each contact's own unsubscribe link when it sends.
const UNSUBSCRIBE_URL = "{{{RESEND_UNSUBSCRIBE_URL}}}"

export interface BroadcastProps {
  // The instance that serves the logo and fonts and that links point into, such as
  // https://app.sniptide.com.
  appUrl?: string
  operator?: Operator
}

export function Broadcast({
  subject,
  preview,
  title,
  date,
  browserUrl,
  appUrl,
  operator,
  children,
}: BroadcastProps & {
  subject: string
  preview: string
  title: string
  // The issue's date as readers should see it, such as "November 21, 2026".
  date?: string
  // A public copy of the same update, such as a changelog entry, linked as "View in browser".
  browserUrl?: string
  children: ReactNode
}) {
  return (
    <EmailFrame
      locale="en"
      subject={subject}
      preview={preview}
      logo={
        appUrl
          ? {
              light: new URL("/email/sniptide-logo.png", appUrl).href,
              dark: new URL("/email/sniptide-logo-dark.png", appUrl).href,
              alt: "Sniptide",
            }
          : undefined
      }
      fontsUrl={appUrl ? new URL("/email/fonts/", appUrl).href : undefined}
    >
      <Padded padding="32px 24px 8px">
        <Heading
          as="h1"
          className="st-text"
          style={{
            margin: date || browserUrl ? "0 0 4px" : "0 0 16px",
            fontFamily: fonts.heading,
            fontSize: "30px",
            lineHeight: "36px",
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: light.foreground,
          }}
        >
          {title}
        </Heading>
        {date || browserUrl ? (
          <Text className="st-muted" style={{ ...text, margin: "0 0 24px", color: light.muted }}>
            {date}
            {date && browserUrl ? " · " : null}
            {browserUrl ? (
              <Link
                className="st-link"
                href={browserUrl}
                style={{ color: light.link, textDecoration: "none" }}
              >
                View in browser
              </Link>
            ) : null}
          </Text>
        ) : null}
        {children}
      </Padded>
      <EmailFooter
        reason="You get this email because you turned on product updates in your Sniptide settings."
        links={[
          ...(appUrl
            ? [
                {
                  label: "Email settings",
                  href: new URL("/settings?tab=notifications", appUrl).href,
                },
              ]
            : []),
          { label: "Unsubscribe", href: UNSUBSCRIBE_URL },
        ]}
        sender={senderLine(operator)}
      />
    </EmailFrame>
  )
}

// The banner under the title: the white mark, a short label and a large title on a blue panel, with
// an optional screenshot beside it. Phones stack the screenshot under the panel. The panel is a table
// cell rather than an image, so its words show when images are blocked.
export function Cover({
  appUrl,
  label,
  title,
  image,
}: {
  appUrl?: string
  label?: string
  title: string
  // A screenshot served by the instance or another HTTPS host, at least 700px wide.
  image?: { src: string; alt: string }
}) {
  const stack = image ? "st-stack" : undefined
  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      border={0}
      style={{
        margin: "0 0 32px",
        borderCollapse: "separate",
        borderRadius: "6px",
        overflow: "hidden",
        backgroundColor: light.primary,
      }}
    >
      <tbody>
        <tr>
          <td
            className={stack}
            width={image ? "42%" : "100%"}
            valign="bottom"
            style={{ padding: "24px", backgroundColor: light.primary }}
          >
            {appUrl ? (
              <Img
                src={new URL("/email/sniptide-mark-white.png", appUrl).href}
                width={32}
                height={32}
                alt=""
                style={{
                  display: "block",
                  border: 0,
                  height: "32px",
                  width: "32px",
                  marginBottom: image ? "96px" : "48px",
                }}
              />
            ) : null}
            {label ? (
              <Text
                style={{
                  margin: "0 0 8px",
                  fontFamily: fonts.mono,
                  fontSize: "14px",
                  lineHeight: "20px",
                  color: light.primaryForeground,
                }}
              >
                {label}
              </Text>
            ) : null}
            <Text
              style={{
                margin: 0,
                fontFamily: fonts.heading,
                fontSize: "40px",
                lineHeight: "44px",
                fontWeight: 700,
                letterSpacing: "-0.03em",
                color: light.primaryForeground,
              }}
            >
              {title}
            </Text>
          </td>
          {image ? (
            <td
              className={stack}
              width="58%"
              valign="top"
              style={{ padding: 0, backgroundColor: light.surface }}
            >
              <Img
                src={image.src}
                alt={image.alt}
                width="100%"
                style={{ display: "block", border: 0, width: "100%", height: "auto" }}
              />
            </td>
          ) : null}
        </tr>
      </tbody>
    </table>
  )
}

export function P({ children }: { children: ReactNode }) {
  return (
    <Text className="st-text" style={text}>
      {children}
    </Text>
  )
}

// A section heading inside the email, in the dialog title size.
export function H2({ children }: { children: ReactNode }) {
  return (
    <Heading
      as="h2"
      className="st-text"
      style={{
        margin: "32px 0 8px",
        fontFamily: fonts.heading,
        fontSize: "20px",
        lineHeight: "28px",
        fontWeight: 700,
        letterSpacing: "-0.02em",
        color: light.foreground,
      }}
    >
      {children}
    </Heading>
  )
}

export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul style={{ margin: "0 0 16px", paddingLeft: "20px" }}>
      {items.map((item, index) => (
        <li key={index} className="st-text" style={{ ...text, margin: "0 0 8px" }}>
          {item}
        </li>
      ))}
    </ul>
  )
}

export function Action({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Section style={{ margin: "8px 0 24px" }}>
      <Button href={href} style={button}>
        {children}
      </Button>
    </Section>
  )
}
