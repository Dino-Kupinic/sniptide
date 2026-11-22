import type { Metadata } from "next"
import { KindPicker } from "@/components/kind-picker"

export const metadata: Metadata = { title: "New email · Sniptide admin" }

export default function Page() {
  return <KindPicker />
}
