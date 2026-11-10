import type { CSSProperties } from "react"
import {
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "react-email"
import type { EmailContent, Paragraph } from "./content"
import { darkModeCss, fonts, light } from "./theme"

const text: CSSProperties = {
  margin: "0 0 16px",
  fontFamily: fonts.sans,
  fontSize: "16px",
  lineHeight: "26px",
  color: light.foreground,
}

const small: CSSProperties = {
  margin: "0 0 8px",
  fontFamily: fonts.sans,
  fontSize: "13px",
  lineHeight: "18px",
  color: light.muted,
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

// The Sniptide lockup as two images: the blue mark with the dark wordmark, and the white version
// that clients with dark mode support swap in. Images that are blocked or missing show the alt text,
// and without an app URL the name is set as text.
function Brand({ logo }: { logo: EmailContent["logo"] }) {
  if (!logo)
    return (
      <Text
        className="st-text"
        style={{
          margin: 0,
          fontFamily: fonts.heading,
          fontSize: "18px",
          lineHeight: "24px",
          fontWeight: 700,
          color: light.foreground,
        }}
      >
        Sniptide
      </Text>
    )
  const image = {
    width: 143,
    height: 24,
    alt: logo.alt,
    style: { display: "block", border: 0, outline: "none", height: "24px", width: "143px" },
  }
  return (
    <>
      <Img className="st-logo-light" src={logo.light} {...image} />
      <div
        className="st-logo-dark"
        style={
          { display: "none", maxHeight: 0, overflow: "hidden", msoHide: "all" } as CSSProperties
        }
      >
        <Img src={logo.dark} {...image} />
      </div>
    </>
  )
}

export function EmailLayout({ content }: { content: EmailContent }) {
  const { preview, heading, body, action, after, note, footer } = content
  return (
    <Html lang={content.locale} dir="ltr">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <title>{content.subject}</title>
        <style>{darkModeCss}</style>
      </Head>
      <Preview useTitleTag={false}>{preview}</Preview>
      {/* A plain body instead of React Email's Body, which repeats the background on an inner cell
          where the dark-mode class can't reach it. */}
      <body className="st-canvas" style={{ margin: 0, padding: 0, backgroundColor: light.canvas }}>
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
              <td style={{ padding: "24px 8px" }}>
                <Container
                  className="st-surface"
                  style={{
                    maxWidth: "600px",
                    backgroundColor: light.surface,
                    border: `1px solid ${light.border}`,
                    borderRadius: "6px",
                  }}
                >
                  <Section style={{ padding: "24px 24px 0" }}>
                    <Brand logo={content.logo} />
                  </Section>
                  <Section style={{ padding: "32px 24px 8px" }}>
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
                      <Button
                        href={action.href}
                        style={{
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
                        }}
                      >
                        {action.label}
                      </Button>
                    </Section>
                    {after?.map((paragraph, index) => (
                      <Text key={index} className="st-text" style={text}>
                        <Runs paragraph={paragraph} />
                      </Text>
                    ))}
                    <Text
                      className="st-muted"
                      style={{ ...small, fontSize: "14px", lineHeight: "20px" }}
                    >
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
                    {note ? (
                      <Text
                        className="st-muted"
                        style={{ ...small, fontSize: "14px", lineHeight: "20px" }}
                      >
                        {note}
                      </Text>
                    ) : null}
                  </Section>
                  <Section style={{ padding: "0 24px 24px" }}>
                    <Hr
                      className="st-rule"
                      style={{
                        margin: "16px 0 16px",
                        border: 0,
                        borderTop: `1px solid ${light.border}`,
                      }}
                    />
                    <Text className="st-muted" style={small}>
                      {footer.reason}
                    </Text>
                    {footer.links?.length ? (
                      <Text className="st-muted" style={small}>
                        {footer.links.map((link, index) => (
                          <span key={link.href}>
                            {index > 0 ? " · " : null}
                            <Link
                              className="st-link"
                              href={link.href}
                              style={{ color: light.link, textDecoration: "underline" }}
                            >
                              {link.label}
                            </Link>
                          </span>
                        ))}
                      </Text>
                    ) : null}
                    {footer.sender ? (
                      <Text className="st-muted" style={{ ...small, margin: 0 }}>
                        {footer.sender}
                      </Text>
                    ) : null}
                  </Section>
                </Container>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </Html>
  )
}
