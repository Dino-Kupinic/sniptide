import type { ReactNode } from "react"
import { Button, Heading, Section, Text } from "react-email"
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
  appUrl,
  operator,
  children,
}: BroadcastProps & { subject: string; preview: string; title: string; children: ReactNode }) {
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
            margin: "0 0 16px",
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
