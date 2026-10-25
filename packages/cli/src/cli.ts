import { rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { parseArgs } from "node:util"
import { Api } from "./api"
import { configPath, normalizeBaseUrl, resolveConfig, saveConfig } from "./config"
import { bundle, type Capture, paste, record, string } from "./contract"
import {
  fetchGroup,
  groupName,
  pushGroup,
  readEnvFile,
  runWith,
  serializeDotenv,
  writeEnvFile,
} from "./env"
import { CliError } from "./errors"
import { collectFiles, readBundle, restoreFiles } from "./files"

const options = {
  "base-url": { type: "string" },
  json: { type: "boolean", short: "j" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean" },
  "token-stdin": { type: "boolean" },
  title: { type: "string" },
  description: { type: "string" },
  visibility: { type: "string" },
  tag: { type: "string", multiple: true },
  collection: { type: "string" },
  lines: { type: "string" },
  output: { type: "string" },
  input: { type: "string" },
  dir: { type: "string" },
  force: { type: "boolean" },
  "dry-run": { type: "boolean" },
  language: { type: "string" },
  cursor: { type: "string" },
  limit: { type: "string" },
  file: { type: "string" },
  stdout: { type: "boolean" },
} as const
const allowed: Record<string, string[]> = {
  login: ["token-stdin"],
  logout: [],
  push: ["title", "description", "visibility", "tag", "collection", "lines", "output", "dry-run"],
  pull: ["input", "dir", "force", "dry-run"],
  list: ["tag", "language", "collection", "cursor", "limit"],
  search: ["tag", "language", "collection", "cursor", "limit"],
  "env list": [],
  "env push": ["file", "dry-run"],
  "env pull": ["file", "force", "dry-run", "stdout"],
  "env run": [],
  "env delete": [],
}
const globalOptions = ["base-url", "json", "help", "version"]

export const help = `Sniptide CLI (Node.js 24+)

  sniptide login --token-stdin       Save a token after checking it with the instance
  sniptide logout                    Remove saved credentials
  sniptide push <files|dirs|globs>    Capture up to 10 files, preserving relative paths
  sniptide pull <id|collection:slug>  Restore files into the current directory
  sniptide list                      List pastes, with optional filters
  sniptide search <query>            Find pastes by title, tag, or language
  sniptide env list                  List your env groups
  sniptide env push <group>          Upload .env to an env group, replacing its variables
  sniptide env pull <group>          Write an env group to .env
  sniptide env run <group> -- <cmd>  Run a command with the group's variables set
  sniptide env delete <group>        Delete an env group

Global: --base-url URL, --json (-j), --help (-h), --version
Push:   --title NAME, --description TEXT, --visibility private|unlisted|public
        --collection SLUG, --tag TAG (repeatable), --lines START:END, --dry-run
        --output FILE (export an offline bundle)
Pull:   --dir DIRECTORY, --force, --dry-run, --input FILE (read an offline bundle)
Find:   --tag TAG (repeatable), --language ID, --collection SLUG, --limit 1..100
        --cursor CURSOR
Env:    --file PATH (default .env), --force, --dry-run, --stdout (pull prints instead)

Create a token in Settings → API tokens. SNIPTIDE_TOKEN / SNIPTIDE_BASE_URL override saved
config. SNIPTIDE_CONFIG overrides the config file location. Commands never prompt.
`

export interface Context {
  cwd: string
  env: NodeJS.ProcessEnv
  stdout: (text: string) => void
  stderr: (text: string) => void
  stdin: () => Promise<string>
}

function countArgs(args: string[], min: number, max: number, usage: string) {
  if (args.length < min || args.length > max) throw new CliError(`Usage: sniptide ${usage}`)
}

function displayText(value: string): string {
  return [...value]
    .map((char) => (char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? " " : char))
    .join("")
}

interface Step {
  step: number
  id: string
  title: string
  instruction: string
}

// A collection's pastes in step order, with each step's instruction for the agent that pulled it.
async function getCollection(
  api: Api,
  slug: string,
): Promise<{ pastes: Capture[]; steps: Step[] }> {
  const pastes: Capture[] = []
  const steps: Step[] = []
  const cursors = new Set<string>()
  let cursor: string | undefined
  let bytes = 0
  do {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""
    const data = await api.request(`collections/${encodeURIComponent(slug)}/pastes${query}`)
    if (!Array.isArray(data.pastes))
      throw new CliError("Invalid collection response.", "INVALID_RESPONSE", 1)
    const page = data.pastes.map(paste)
    // Servers from before flows send no steps; their pastes have no instructions.
    const instructions = new Map<string, string>()
    if (Array.isArray(data.steps))
      for (const item of data.steps) {
        const entry = record(item)
        if (typeof entry.instruction !== "string")
          throw new CliError("Invalid collection step.", "INVALID_RESPONSE", 1)
        instructions.set(string(entry.id, "step id"), entry.instruction)
      }
    for (const item of page)
      steps.push({
        step: steps.length + 1,
        id: item.id,
        title: item.title,
        instruction: instructions.get(item.id) ?? "",
      })
    pastes.push(...page)
    for (const item of page) {
      for (const file of item.files) bytes += Buffer.byteLength(file.content)
    }
    if (bytes > 20 * 1024 * 1024)
      throw new CliError("Pulls are limited to 20 MiB. Pull fewer pastes.")
    if (pastes.length > 1000)
      throw new CliError("Collection exceeds 1000 pastes. Pull individual pastes instead.")
    if (data.nextCursor !== null && typeof data.nextCursor !== "string")
      throw new CliError("Invalid collection cursor.", "INVALID_RESPONSE", 1)
    cursor = data.nextCursor === null ? undefined : string(data.nextCursor, "cursor")
    if (cursor && cursors.has(cursor))
      throw new CliError("Collection pagination repeated a cursor.", "INVALID_RESPONSE", 1)
    if (cursor) cursors.add(cursor)
  } while (cursor)
  return { pastes, steps }
}

// Returns an exit status rather than exiting, so tests and embedding tools share the real flow.
export async function run(argv: string[], ctx: Context): Promise<number> {
  // Everything after `--` belongs to the command `env run` starts, not to this CLI.
  const separator = argv.indexOf("--")
  const args = separator === -1 ? argv : argv.slice(0, separator)
  const rest = separator === -1 ? [] : argv.slice(separator + 1)
  let json = args.includes("--json") || args.includes("-j") || args.includes("--json=true")
  const emit = (data: unknown, human: string) =>
    ctx.stdout(json ? `${JSON.stringify({ ok: true, data })}\n` : `${human}\n`)
  try {
    const parsed = parseArgs({ args, options, allowPositionals: true, tokens: true })
    const { values } = parsed
    json = values.json ?? false
    const [command, ...params] = parsed.positionals
    const runsCommand = command === "env" && params[0] === "run"
    if (!runsCommand) params.push(...rest)
    if (values.help) {
      emit({ help }, help.trimEnd())
      return 0
    }
    if (values.version) {
      emit({ version: "0.1.0" }, "0.1.0")
      return 0
    }
    if (!command) {
      emit({ help }, help.trimEnd())
      return 0
    }
    const key = command === "env" ? `env ${params[0] ?? ""}` : command
    if (!allowed[key])
      throw new CliError(
        command === "env"
          ? "Use sniptide env list, push, pull, run or delete."
          : `Unknown command ${JSON.stringify(command)}. Run sniptide --help.`,
      )
    for (const token of parsed.tokens) {
      if (
        token.kind === "option" &&
        !globalOptions.includes(token.name) &&
        !allowed[key]?.includes(token.name)
      ) {
        throw new CliError(`--${token.name} is not supported by ${key}.`)
      }
    }
    if (command === "env") {
      const [action, ...names] = params
      const api = async () => new Api(await resolveConfig(ctx.env, values["base-url"]))
      if (action === "list") {
        countArgs(names, 0, 0, "env list")
        const data = await (await api()).request("env")
        if (!Array.isArray(data.groups))
          throw new CliError("Invalid env group list.", "INVALID_RESPONSE", 1)
        const lines = data.groups.map((item) => {
          const group = record(item)
          return `${displayText(string(group.slug, "group"))}\t${Number(group.variables)} variables`
        })
        emit(data, lines.join("\n") || "No env groups yet.")
        return 0
      }
      countArgs(
        names,
        1,
        1,
        action === "run" ? "env run <group> -- <command> [args...]" : `env ${action} <group>`,
      )
      const group = groupName(names[0])
      const filename = path.resolve(ctx.cwd, values.file ?? ".env")
      if (action === "push") {
        const variables = await readEnvFile(filename)
        const listed = variables.map((variable) => variable.name)
        if (values["dry-run"]) {
          emit(
            { group, file: filename, variables: listed, dryRun: true },
            `Would push ${listed.length} variables to ${group}:\n${listed.join("\n")}`,
          )
          return 0
        }
        const saved = await pushGroup(await api(), group, variables)
        emit(
          { group: saved.slug, variables: saved.variables.map((variable) => variable.name) },
          `Pushed ${saved.variables.length} variables to ${saved.slug}.`,
        )
        return 0
      }
      if (action === "delete") {
        await (await api()).request(`env/${encodeURIComponent(group)}`, undefined, "DELETE")
        emit({ deleted: group }, `Deleted env group ${group}.`)
        return 0
      }
      const { variables } = await fetchGroup(await api(), group)
      if (action === "run") {
        const [program, ...programArgs] = rest
        if (!program) throw new CliError("Usage: sniptide env run <group> -- <command> [args...]")
        return await runWith(program, programArgs, ctx.cwd, ctx.env, variables)
      }
      // env pull
      if (values.stdout) {
        if (json) emit({ group, variables }, "")
        else ctx.stdout(serializeDotenv(variables))
        return 0
      }
      const listed = variables.map((variable) => variable.name)
      if (!values["dry-run"]) await writeEnvFile(filename, variables, values.force ?? false)
      emit(
        { group, file: filename, variables: listed, dryRun: values["dry-run"] ?? false },
        `${values["dry-run"] ? "Would write" : "Wrote"} ${listed.length} variables to ${filename}.`,
      )
      return 0
    }
    if (command === "logout") {
      countArgs(params, 0, 0, "logout")
      await rm(configPath(ctx.env), { force: true })
      emit({ loggedOut: true }, "Removed saved credentials. SNIPTIDE_TOKEN, if set, still applies.")
      return 0
    }
    if (command === "login") {
      countArgs(params, 0, 0, "login --token-stdin")
      const token = (values["token-stdin"] ? await ctx.stdin() : ctx.env.SNIPTIDE_TOKEN)?.trim()
      if (!token || token.length > 4096 || /[\s]/.test(token))
        throw new CliError("Provide a token using --token-stdin or SNIPTIDE_TOKEN.")
      const resolved = await resolveConfig(ctx.env, values["base-url"])
      const config = { baseUrl: normalizeBaseUrl(resolved.baseUrl), token }
      const data = await new Api(config).request("me")
      const user = record(data.user)
      string(user.id, "user id")
      await saveConfig(ctx.env, config)
      emit({ baseUrl: config.baseUrl, userId: user.id }, `Logged in to ${config.baseUrl}.`)
      return 0
    }
    if (command === "push") {
      if (values.output && values["dry-run"]) throw new CliError("Choose --output or --dry-run.")
      const collected = await collectFiles(ctx.cwd, params, values.lines)
      const visibility = values.visibility ?? "private"
      if (visibility !== "private" && visibility !== "unlisted" && visibility !== "public")
        throw new CliError("Visibility must be private, unlisted, or public.")
      const title = (values.title ?? path.basename(ctx.cwd)).trim()
      const description = values.description ?? ""
      if (!title || title.length > 120 || description.length > 280)
        throw new CliError(
          "Use a title of 1–120 characters and description of at most 280 characters.",
        )
      const tags = [...new Set((values.tag ?? []).map((tag) => tag.trim()))]
      if (tags.length > 20 || tags.some((tag) => !tag || tag.length > 50))
        throw new CliError("Use up to 20 nonempty tags, each at most 50 characters.")
      const capture: Capture = {
        ...collected,
        title,
        description,
        visibility,
        tags,
        collection: values.collection ?? null,
      }
      if (values["dry-run"]) {
        emit(
          capture,
          `Would capture ${capture.files.length} files:\n${capture.files.map((file) => file.name).join("\n")}`,
        )
        return 0
      }
      if (values.output) {
        const filename = path.resolve(ctx.cwd, values.output)
        await writeFile(
          filename,
          `${JSON.stringify({ version: 1, pastes: [capture] }, null, 2)}\n`,
          { flag: "wx", mode: 0o600 },
        )
        emit(
          { bundle: filename, files: capture.files.map((file) => file.name) },
          `Exported ${capture.files.length} files to ${filename}.`,
        )
        return 0
      }
      const api = new Api(await resolveConfig(ctx.env, values["base-url"]))
      const result = paste((await api.request("pastes", capture)).paste)
      emit(result, `Created ${displayText(result.id)} (${result.files.length} files).`)
      return 0
    }
    if (command === "pull") {
      countArgs(
        params,
        values.input ? 0 : 1,
        values.input ? 0 : 1,
        values.input
          ? "pull --input BUNDLE [--dir DIRECTORY]"
          : "pull <id|collection:slug> [--dir DIRECTORY]",
      )
      let pastes: Capture[]
      let steps: Step[] | null = null
      if (values.input)
        pastes = bundle(await readBundle(path.resolve(ctx.cwd, values.input))).pastes
      else {
        const id = params[0] as string
        if (!id || /[\s/?#\\]/.test(id) || id === "." || id === "..")
          throw new CliError("Provide a paste id or collection:slug.")
        const api = new Api(await resolveConfig(ctx.env, values["base-url"]))
        if (id.startsWith("collection:")) {
          const slug = id.slice("collection:".length)
          if (!slug || slug === "." || slug === "..")
            throw new CliError("Provide a collection slug after collection:.")
          ;({ pastes, steps } = await getCollection(api, slug))
        } else pastes = [paste((await api.request(`pastes/${encodeURIComponent(id)}`)).paste)]
      }
      const directory = path.resolve(ctx.cwd, values.dir ?? ".")
      const files = await restoreFiles(
        directory,
        pastes,
        values.force ?? false,
        values["dry-run"] ?? false,
      )
      const stepText = steps?.length
        ? `\nSteps:\n${steps
            .map(
              (step) =>
                `${step.step}. ${displayText(step.title)}${step.instruction ? `: ${displayText(step.instruction)}` : ""}`,
            )
            .join("\n")}`
        : ""
      emit(
        { directory, files, dryRun: values["dry-run"] ?? false, ...(steps ? { steps } : {}) },
        `${values["dry-run"] ? "Would write" : "Wrote"} ${files.length} files in ${directory}.\n${files.join("\n")}${stepText}`,
      )
      return 0
    }
    countArgs(
      params,
      command === "search" ? 1 : 0,
      command === "search" ? 1 : 0,
      `${command}${command === "search" ? " <query>" : ""}`,
    )
    const query = new URLSearchParams()
    if (command === "search") query.set("q", params[0] as string)
    for (const key of ["language", "collection", "cursor"] as const)
      if (values[key]) query.set(key, values[key])
    for (const tag of values.tag ?? []) query.append("tag", tag)
    if (values.limit) {
      const limit = Number(values.limit)
      if (!/^\d+$/.test(values.limit) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
        throw new CliError("--limit must be 1–100.")
      query.set("limit", String(limit))
    }
    const api = new Api(await resolveConfig(ctx.env, values["base-url"]))
    const data = await api.request(`pastes?${query}`)
    if (!Array.isArray(data.pastes))
      throw new CliError("Invalid list response.", "INVALID_RESPONSE", 1)
    const entries = data.pastes.map((item) => {
      const entry = record(item)
      return { id: string(entry.id, "id"), title: string(entry.title, "title") }
    })
    if (data.nextCursor !== null && typeof data.nextCursor !== "string")
      throw new CliError("Invalid list cursor.", "INVALID_RESPONSE", 1)
    // Keep all server-provided summary metadata in JSON output; human output stays brief.
    emit(
      data,
      `${entries.map((entry) => `${displayText(entry.id)}\t${displayText(entry.title)}`).join("\n") || "No pastes found."}${data.nextCursor ? `\nNext cursor: ${displayText(String(data.nextCursor))}` : ""}`,
    )
    return 0
  } catch (error) {
    const argumentError =
      error instanceof Error && "code" in error && String(error.code).startsWith("ERR_PARSE_ARGS_")
    const problem =
      error instanceof CliError
        ? error
        : new CliError(
            error instanceof Error && "code" in error && error.code === "EEXIST"
              ? "Output already exists. Choose another bundle path or use pull --force."
              : error instanceof Error && "code" in error && error.code === "ENOENT"
                ? "A file or directory does not exist."
                : argumentError
                  ? "Invalid command options. Run sniptide --help."
                  : "Command failed. Check the arguments, file permissions, and configuration.",
            argumentError ? "INVALID_INPUT" : "COMMAND_FAILED",
            argumentError ? 2 : 1,
          )
    const output = json
      ? JSON.stringify({ ok: false, error: { code: problem.code, message: problem.message } })
      : `Error: ${problem.message}`
    ctx.stderr(`${output}\n`)
    return problem.exitCode
  }
}
