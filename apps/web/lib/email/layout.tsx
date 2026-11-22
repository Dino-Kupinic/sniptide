import { EmailFooter, EmailFrame, Padded, small, text } from "@workspace/email/frame"
import { fonts, light } from "@workspace/email/theme"
import type { CSSProperties } from "react"
import { Button, Heading, Hr, Img, Link, Section, Text } from "react-email"
import type { EmailContent, Feature, Paragraph } from "./content"

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

const rule: CSSProperties = {
  margin: "0 0 24px",
  border: 0,
  borderTop: `1px solid ${light.border}`,
}

const groupHeading: CSSProperties = {
  margin: "0 0 12px",
  fontFamily: fonts.heading,
  fontSize: "16px",
  lineHeight: "24px",
  fontWeight: 700,
  letterSpacing: "-0.01em",
  color: light.foreground,
}

function FeatureIcon({ icon }: { icon: Feature["icon"] }) {
  const image = {
    width: 20,
    height: 20,
    alt: "",
    style: { display: "block", border: 0, outline: "none", width: "20px", height: "20px" },
  }
  return (
    <>
      <Img className="st-logo-light" src={icon.light} {...image} />
      <div
        className="st-logo-dark"
        style={
          { display: "none", maxHeight: 0, overflow: "hidden", msoHide: "all" } as CSSProperties
        }
      >
        <Img src={icon.dark} {...image} />
      </div>
    </>
  )
}

// One group of features as a row of three cells, each an icon over a linked title and one
// sentence. Phones stack the cells. The row is a table so Outlook keeps the columns.
function FeatureRow({ features }: { features: Feature[] }) {
  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      border={0}
      style={{ margin: "0 0 16px" }}
    >
      <tbody>
        <tr>
          {features.map((feature, index) => (
            <td
              key={feature.href}
              className="st-stack"
              width={`${Math.floor(100 / features.length)}%`}
              valign="top"
              style={{ padding: index === features.length - 1 ? "0 0 16px" : "0 16px 16px 0" }}
            >
              <FeatureIcon icon={feature.icon} />
              <Text style={{ ...text, margin: "8px 0 4px", fontSize: "15px", lineHeight: "22px" }}>
                <Link
                  className="st-link"
                  href={feature.href}
                  style={{ color: light.link, fontWeight: 600, textDecoration: "none" }}
                >
                  {feature.label}
                </Link>
              </Text>
              <Text
                className="st-muted"
                style={{
                  ...text,
                  margin: 0,
                  fontSize: "14px",
                  lineHeight: "20px",
                  color: light.muted,
                }}
              >
                {feature.body}
              </Text>
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  )
}

export function EmailLayout({ content }: { content: EmailContent }) {
  const { preview, heading, body, action, features, after, note, footer } = content
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
        {features ? (
          <Section>
            <Hr className="st-rule" style={rule} />
            <Heading
              as="h2"
              className="st-text"
              style={{ ...groupHeading, margin: "0 0 24px", fontSize: "20px", lineHeight: "28px" }}
            >
              {features.heading}
            </Heading>
            {features.groups.map((group) => (
              <Section key={group.heading}>
                <Heading as="h3" className="st-text" style={groupHeading}>
                  {group.heading}
                </Heading>
                <FeatureRow features={group.features} />
              </Section>
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
