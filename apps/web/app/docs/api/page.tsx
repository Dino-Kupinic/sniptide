import type { Metadata } from "next"
import { ApiReference } from "@/components/docs/api-reference"

export const metadata: Metadata = {
  title: "API reference · Sniptide",
  description:
    "The HTTP endpoints Sniptide serves: reading, unlocking and revealing shared pastes.",
}

// The API reference, rendered by Scalar from /api/openapi.json (lib/openapi.ts).
export default function Page() {
  return <ApiReference />
}
