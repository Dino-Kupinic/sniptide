#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { defaultBaseUrl, TokenApiBackend } from "./client"
import { createSniptideServer, ToolError } from "./server"

try {
  if (process.argv.length > 2)
    throw new ToolError(
      "Configure SNIPTIDE_TOKEN and optionally SNIPTIDE_BASE_URL through the environment; no arguments are supported.",
    )
  const backend = new TokenApiBackend(
    process.env.SNIPTIDE_BASE_URL ?? defaultBaseUrl,
    process.env.SNIPTIDE_TOKEN?.trim() ?? "",
  )
  await createSniptideServer(backend).connect(new StdioServerTransport())
} catch (error) {
  process.stderr.write(
    `${error instanceof ToolError ? error.message : "Couldn't start Sniptide MCP."}\n`,
  )
  process.exitCode = 1
}
