import type { Metadata } from "next"
import { ApiReference } from "@/components/docs/api-reference"

export const metadata: Metadata = {
  title: "API reference · Sniptide",
  description:
    "The HTTP endpoints Sniptide serves: shared pastes, and the token API the sniptide CLI uses for pastes, collections and env groups.",
}

// The API reference, rendered by Scalar from /api/openapi.json (lib/openapi.ts).
export default function Page() {
  return <ApiReference />
}
