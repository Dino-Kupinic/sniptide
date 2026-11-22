import { EmailFooter, EmailFrame, Padded, small, text } from "@workspace/email/frame"
import { fonts, light } from "@workspace/email/theme"
import type { CSSProperties } from "react"
import { Button, Heading, Hr, Link, Section, Text } from "react-email"
import type { EmailContent, Paragraph } from "./content"

// The primary action: the raised blue button from the app, with its darker edge.
const button: CSSProperties = {
  display: "inline-block",
  padding: "12px 20px",
  borderRadius: "6px",
  borderBottom: `2px solid ${light.depth}`,
  backgroundColor: light.primary,
  color: light.primaryForeground,
  fontFamily: fonts.sans,
  fontSize: "16px",
  lineHeight: "20px",
  fontWeight: 600,
  textDecoration: "none",
}

function Runs({ paragraph }: { paragraph: Paragraph }) {
  return paragraph.map((segment, index) =>
    typeof segment === "string" ? (
      segment
    ) : (
      <strong key={index} style={{ fontWeight: 600 }}>
        {segment.strong}
      </strong>
    ),
  )
}

export function EmailLayout({ content }: { content: EmailContent }) {
  const { preview, heading, body, action, steps, after, note, footer } = content
  return (
    <EmailFrame
      locale={content.locale}
      subject={content.subject}
      preview={preview}
      logo={content.logo}
      fontsUrl={content.fontsUrl}
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
          {heading}
        </Heading>
        {body.map((paragraph, index) => (
          <Text key={index} className="st-text" style={text}>
            <Runs paragraph={paragraph} />
          </Text>
        ))}
        <Section style={{ margin: "8px 0 24px" }}>
          <Button href={action.href} style={button}>
            {action.label}
          </Button>
        </Section>
        {steps?.length ? (
          <Section>
            <Hr
              className="st-rule"
              style={{
                margin: "0 0 20px",
                border: 0,
                borderTop: `1px solid ${light.border}`,
              }}
            />
            {steps.map((step) => (
              <Text key={step.href} style={{ ...text, margin: "0 0 16px" }}>
                <Link
                  className="st-link"
                  href={step.href}
                  style={{ color: light.link, fontWeight: 600, textDecoration: "none" }}
                >
                  {step.label}
                </Link>
                <br />
                <span className="st-muted" style={{ color: light.muted }}>
                  {step.body}
                </span>
              </Text>
            ))}
          </Section>
        ) : null}
        {after?.map((paragraph, index) => (
          <Text key={index} className="st-text" style={text}>
            <Runs paragraph={paragraph} />
          </Text>
        ))}
        {content.buttonFallback ? (
          <>
            <Text className="st-muted" style={{ ...small, fontSize: "14px", lineHeight: "20px" }}>
              {content.buttonFallback}
            </Text>
            <Text
              style={{
                ...small,
                margin: "0 0 16px",
                fontFamily: fonts.mono,
                wordBreak: "break-all",
              }}
            >
              <Link className="st-link" href={action.href} style={{ color: light.link }}>
                {action.href}
              </Link>
            </Text>
          </>
        ) : null}
        {note ? (
          <Text className="st-muted" style={{ ...small, fontSize: "14px", lineHeight: "20px" }}>
            {note}
          </Text>
        ) : null}
      </Padded>
      <EmailFooter {...footer} />
    </EmailFrame>
  )
}
