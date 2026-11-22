import type { CSSProperties, ReactNode } from "react"
import { Container, Head, Hr, Html, Img, Link, Preview, Text } from "react-email"
import { darkModeCss, fontFaceCss, fonts, light, phoneCss } from "./theme"

// The frame every Sniptide email shares: the document, canvas, card, logo and footer. The app's
// transactional emails and the product update emails both build on it, so they look the same.

export interface EmailLink {
  label: string
  href: string
}

// The Sniptide lockup, served by the instance. Without it the email shows the name as text.
export interface EmailLogo {
  light: string
  dark: string
  alt: string
}

export interface EmailFooterContent {
  reason: string
  links?: EmailLink[]
  sender?: string
}

export const text: CSSProperties = {
  margin: "0 0 16px",
  fontFamily: fonts.sans,
  fontSize: "16px",
  lineHeight: "26px",
  color: light.foreground,
}

export const small: CSSProperties = {
  margin: "0 0 8px",
  fontFamily: fonts.sans,
  fontSize: "13px",
  lineHeight: "18px",
  color: light.muted,
}

// One block of the card. The class lets phones swap the 24px sides for the 16px gutter.
export function Padded({ padding, children }: { padding: string; children: ReactNode }) {
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
      <tbody>
        <tr>
          <td className="st-pad" style={{ padding }}>
            {children}
          </td>
        </tr>
      </tbody>
    </table>
  )
}

// The Sniptide lockup as two images: the blue mark with the dark wordmark, and the white version
// that clients with dark mode support swap in. Images that are blocked or missing show the alt text,
// and without an app URL the name is set as text.
function Brand({ logo }: { logo: EmailLogo | undefined }) {
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

// The document, canvas and card every Sniptide email shares, with the logo at the top. The
// content and footer go inside the card.
export function EmailFrame({
  locale,
  subject,
  preview,
  logo,
  fontsUrl,
  children,
}: {
  locale: string
  subject: string
  preview: string
  logo?: EmailLogo
  fontsUrl?: string
  children: ReactNode
}) {
  return (
    <Html lang={locale} dir="ltr">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <title>{subject}</title>
        <style>{`${fontsUrl ? fontFaceCss(fontsUrl) : ""}${phoneCss}${darkModeCss}`}</style>
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
              <td className="st-outer" style={{ padding: "24px 8px" }}>
                <Container
                  className="st-surface"
                  style={{
                    maxWidth: "600px",
                    backgroundColor: light.surface,
                    border: `1px solid ${light.border}`,
                    borderRadius: "6px",
                  }}
                >
                  <Padded padding="24px 24px 0">
                    <Brand logo={logo} />
                  </Padded>
                  {children}
                </Container>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </Html>
  )
}

// Why the reader got the email, its links (such as a way out) and who sent it.
export function EmailFooter({ reason, links, sender }: EmailFooterContent) {
  return (
    <Padded padding="0 24px 24px">
      <Hr
        className="st-rule"
        style={{
          margin: "16px 0 16px",
          border: 0,
          borderTop: `1px solid ${light.border}`,
        }}
      />
      <Text className="st-muted" style={small}>
        {reason}
      </Text>
      {links?.length ? (
        <Text className="st-muted" style={small}>
          {links.map((link, index) => (
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
      {sender ? (
        <Text className="st-muted" style={{ ...small, margin: 0 }}>
          {sender}
        </Text>
      ) : null}
    </Padded>
  )
}
