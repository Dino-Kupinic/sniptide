import type { Metadata } from "next"
import { connection } from "next/server"
import { Overview } from "@/components/overview"
import { overview } from "@/lib/overview"

export const metadata: Metadata = { title: "Overview · Sniptide admin" }

export default async function Page() {
  // The figures read the database on every request, never at build time.
  await connection()
  const data = await overview()
  return (
    <Overview
      {...data}
      recent={data.recent.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))}
      now={new Date().toISOString()}
    />
  )
}
