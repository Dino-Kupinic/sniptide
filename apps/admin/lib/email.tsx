import { button, EmailFooter, EmailFrame, Padded, small, text } from "@workspace/email/frame"
import { fonts, light } from "@workspace/email/theme"
import type { ReactNode } from "react"
import { Button, Heading, Img, Link, Markdown, Section, Text } from "react-email"

// Emails to subscribers (product updates, surveys and guides) sent as Resend Broadcasts, built on
// the same frame as the app's emails. They are written in English, because one segment holds every
// subscriber.

// Who sends the email: marketing email has to name its sender with a postal address.
export interface Operator {
  name: string
  address?: string
}

function senderLine(operator: Operator | undefined) {
  if (!operator) return undefined
  const address = operator.address
    ?.split(/\s*\n\s*/)
    .filter(Boolean)
    .join(", ")
  return address ? `Sent by ${operator.name}, ${address}.` : `Sent by ${operator.name}.`
}

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
  meta,
  browserUrl,
  appUrl,
  operator,
  children,
}: BroadcastProps & {
  subject: string
  preview: string
  title: string
  // The muted line under the title, such as an issue's date or a guide's reading time.
  meta?: string
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
            margin: meta || browserUrl ? "0 0 4px" : "0 0 16px",
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
        {meta || browserUrl ? (
          <Text className="st-muted" style={{ ...text, margin: "0 0 24px", color: light.muted }}>
            {meta}
            {meta && browserUrl ? " · " : null}
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

const heading = {
  fontFamily: fonts.heading,
  fontWeight: 700,
  letterSpacing: "-0.02em",
  color: light.foreground,
}

// The body of a broadcast, written in Markdown. Styles are inlined for clients that drop the
// stylesheet, and the st-md class lets clients with dark mode recolor them.
export function MarkdownBody({ children }: { children: string }) {
  return (
    <div className="st-md">
      <Markdown
        markdownContainerStyles={{ padding: 0 }}
        markdownCustomStyles={{
          p: text,
          h1: { ...heading, margin: "32px 0 8px", fontSize: "24px", lineHeight: "32px" },
          h2: { ...heading, margin: "32px 0 8px", fontSize: "20px", lineHeight: "28px" },
          h3: { ...heading, margin: "24px 0 8px", fontSize: "16px", lineHeight: "24px" },
          ul: { margin: "0 0 16px", paddingLeft: "20px" },
          ol: { margin: "0 0 16px", paddingLeft: "20px" },
          li: { ...text, margin: "0 0 8px" },
          link: { color: light.link, textDecoration: "underline" },
          bold: { fontWeight: 600 },
          image: { display: "block", maxWidth: "100%", height: "auto", borderRadius: "6px" },
          codeInline: {
            fontFamily: fonts.mono,
            fontSize: "14px",
            backgroundColor: light.fill,
            borderRadius: "4px",
            padding: "1px 4px",
          },
          codeBlock: {
            margin: "0 0 16px",
            padding: "12px 16px",
            fontFamily: fonts.mono,
            fontSize: "13px",
            lineHeight: "20px",
            backgroundColor: light.fill,
            borderRadius: "6px",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          },
          hr: { border: 0, borderTop: `1px solid ${light.border}`, margin: "24px 0" },
        }}
      >
        {children}
      </Markdown>
    </div>
  )
}

// The email's one action, as the raised blue button from the app.
export function Action({ href, label, note }: { href: string; label: string; note?: string }) {
  return (
    <Section style={{ margin: "8px 0 24px" }}>
      <Button href={href} style={button}>
        {label}
      </Button>
      {note ? (
        <Text className="st-muted" style={{ ...small, margin: "12px 0 0", fontSize: "14px" }}>
          {note}
        </Text>
      ) : null}
    </Section>
  )
}

// A link to the same survey for each score, so a reader can answer the question in one click. The
// survey receives the score as ?rating=1 to ?rating=5.
export function ratingLinks(url: string) {
  return [1, 2, 3, 4, 5].map((score) => {
    const link = new URL(url)
    link.searchParams.set("rating", String(score))
    return { score, href: link.href }
  })
}

// A question with a row of five scores under it, ends labeled. Each score is a linked cell, so it
// stays a large tap target on phones and shows its number when images are blocked.
export function Rating({ question, url }: { question: string; url: string }) {
  const cell = {
    display: "block",
    padding: "12px 0",
    border: `1px solid ${light.border}`,
    borderRadius: "6px",
    fontFamily: fonts.sans,
    fontSize: "16px",
    lineHeight: "20px",
    fontWeight: 600,
    textAlign: "center" as const,
    textDecoration: "none",
    color: light.link,
  }
  return (
    <Section style={{ margin: "8px 0 24px" }}>
      <Text className="st-text" style={{ ...text, margin: "0 0 12px", fontWeight: 600 }}>
        {question}
      </Text>
      <table
        role="presentation"
        width="100%"
        cellPadding={0}
        cellSpacing={0}
        border={0}
        style={{ borderCollapse: "collapse" }}
      >
        <tbody>
          <tr>
            {ratingLinks(url).map(({ score, href }) => (
              <td key={score} width="20%" style={{ padding: score === 5 ? 0 : "0 8px 0 0" }}>
                <Link className="st-link st-rule" href={href} style={cell}>
                  {score}
                </Link>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
        <tbody>
          <tr>
            <td className="st-muted" style={{ ...small, paddingTop: "8px" }}>
              Not at all
            </td>
            <td className="st-muted" align="right" style={{ ...small, paddingTop: "8px" }}>
              Very much
            </td>
          </tr>
        </tbody>
      </table>
    </Section>
  )
}
