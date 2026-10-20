#!/usr/bin/env node
import { run } from "./cli"
import { CliError } from "./errors"

process.exitCode = await run(process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  stdin: async () => {
    if (process.stdin.isTTY) throw new CliError("Pipe a token to login --token-stdin.")
    let value = ""
    for await (const chunk of process.stdin) {
      value += chunk.toString("utf8")
      if (value.length > 4096) throw new CliError("Token input is too long.")
    }
    return value
  },
})
