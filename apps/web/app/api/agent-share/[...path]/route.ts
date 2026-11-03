import { readSharedPaste } from "@/lib/pastes/store"

export const dynamic = "force-dynamic"

export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  const read =
    path.length === 1 && path[0]
      ? await readSharedPaste(path[0], { visit: false })
      : { status: "missing" as const }
  let body =
    "# Not found\n\nThis page or paste does not exist, has expired, or is not available to you.\n\nPublic documentation: https://docs.sniptide.com\n"
  if (read.status === "locked")
    body = "# Password required\n\nOpen this paste in a browser and enter its password.\n"
  if (read.status === "sealed")
    body = "# Burn after read\n\nOpen this paste in a browser to reveal it.\n"
  if (read.status === "ok") {
    body = `# ${read.paste.title}\n\n`
    body += read.paste.allowRaw
      ? read.paste.files
          .map((file) => {
            let fenceLength = 3
            for (const match of file.content.matchAll(/`+/g))
              fenceLength = Math.max(fenceLength, match[0].length + 1)
            const fence = "`".repeat(fenceLength)
            return `## ${file.name}\n\n${fence}${file.language}\n${file.content}\n${fence}\n`
          })
          .join("\n")
      : "Raw access is disabled for this paste. Open it in a browser.\n"
  }
  return new Response(body, {
    status: read.status === "missing" ? 404 : 200,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "private, no-store",
      vary: "Accept, Cookie",
      "x-content-type-options": "nosniff",
    },
  })
}
