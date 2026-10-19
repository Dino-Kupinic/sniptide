import {
  unsubscribeNotificationEmail,
  verifyUnsubscribeToken,
} from "@/lib/notifications/unsubscribe"

function page(content: string, status = 200) {
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Notification emails · Sniptide</title><body><main><h1>Notification emails</h1>${content}</main></body></html>`,
    {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "x-robots-tag": "noindex, nofollow",
        "content-security-policy":
          "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      },
    },
  )
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? ""
  const payload = verifyUnsubscribeToken(token)
  if (!payload)
    return page(
      "<p>This link is invalid or has expired. Change your email preferences in Settings.</p>",
      400,
    )
  const label = {
    shared: "shared paste",
    burned: "burn after read",
    expiring: "expiring paste",
    views: "view milestone",
  }[payload.kind]
  return page(
    `<p>Stop ${label} emails? Your other notification preferences will stay the same.</p><form method="post" action="?token=${encodeURIComponent(token)}"><button type="submit">Stop these emails</button></form>`,
  )
}

export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? ""
  if (!(await unsubscribeNotificationEmail(token)))
    return page(
      "<p>This link is invalid or has expired. Change your email preferences in Settings.</p>",
      400,
    )
  return page(
    '<p>These emails are now off. Your in-app notifications and other emails are unchanged.</p><p><a href="/settings?tab=notifications">Manage notifications</a></p>',
  )
}
