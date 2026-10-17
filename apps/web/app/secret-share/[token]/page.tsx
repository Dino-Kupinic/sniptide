import { SharedSecret } from "@/components/secrets/shared-secret"

export const metadata = {
  title: "Protected secrets · Sniptide",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}
export const dynamic = "force-dynamic"
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <SharedSecret token={token} />
}
