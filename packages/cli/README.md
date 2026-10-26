# Sniptide CLI

One CLI for people and coding agents to capture code, preserve its folder structure, and reuse it in
another project, and to sync a project's `.env` with Sniptide. It talks to the instance's token API
([summary](API.md), full reference at `/docs/api`) with a personal API token from Settings → API
tokens. Offline bundle export and import work without an account.

## Install

The first npm release is pending owner approval. After it is approved, install on Node.js 24 or newer:

```sh
npm install --global @sniptide/cli@0.1.0
sniptide --help
```

## Run from this repository

```sh
bun install
bun --filter @sniptide/cli build
node packages/cli/dist/sniptide.js --help
```

The built executable uses Node.js 24+ and has no runtime package dependencies. For use from another
project, create an alias with the absolute location of your checkout:

```sh
alias sniptide='node /path/to/sniptide/packages/cli/dist/sniptide.js'
```

During local development, `bun run cli <command>` runs the
source, and `bun run test:cli` runs the built Node executable against temporary projects and a local
HTTP server. `apps/web/test/cli-roundtrip.test.ts` runs the CLI against the app's real route handlers
and database.

## Move a component between projects today

From the first project's root:

```sh
sniptide push src/components/button --title 'Button' --output /tmp/button.json --json
```

From the second project's root:

```sh
sniptide pull --input /tmp/button.json --json
```

Every file keeps its path relative to the directory where `push` ran. Files are captured in sorted
path order; collection pulls retain the server's order. Files, directories, and quoted globs can be
combined; overlapping matches are deduplicated. Every supplied pattern must match eligible files.
The bundle is versioned JSON containing code and source metadata. It is written with owner-only
permissions and never replaces an existing file.

A paste holds up to 10 UTF-8 text files and 1 MiB of content, matching the app's default limits. Narrow
larger selections instead of silently dropping files. Binary files, symbolic links, `.env` files,
Git internals and build/dependency directories are excluded. Git-ignored files are skipped. Explicit
unsafe paths fail. Code captures never include env files; those go through `sniptide env`.

Selections use 1-based inclusive line numbers and require exactly one file:

```sh
sniptide push src/components/Button.tsx --lines 10:35 --output /tmp/button-selection.json
```

The selection's original path and line range are retained. Pull writes the selected text as the
whole destination file; it does not splice it into an existing file.

Git captures include the origin repository, HEAD commit and whether the selected files differ from
that commit (including untracked files). Credentials and query strings are removed from repository
URLs. Outside a Git repository, source metadata is null. Files retain their language; unknown
extensions use `text`. The original working files are captured, including uncommitted edits.

## Connect to an instance

Create a token in Settings → API tokens (read-only, or with write access to create pastes and push
env groups), then:

```sh
export SNIPTIDE_TOKEN='snpt_…'
sniptide push 'src/components/**/*.tsx' --title 'Buttons' --collection ui --tag react --json
sniptide pull PASTE_ID --dir src/imported --json
sniptide pull collection:ui --dry-run --json
sniptide search 'button' --language typescript --tag react --limit 20 --json
sniptide list --collection ui --cursor CURSOR --json
```

`push` defaults to private visibility. Set `--visibility unlisted` or `--visibility public` explicitly
to share a capture. `--collection` names an existing collection; it does not create one. Tags may be
repeated. Search and list return one cursor page; use `--cursor` to continue. Collection pulls fetch
all ordered pages before touching the destination, up to 1,000 pastes and 20 MiB of code.

For self-hosting, use `SNIPTIDE_BASE_URL` or `--base-url https://paste.example.com`. URL path prefixes
are supported. The hosted default is `https://app.sniptide.com`. HTTPS is required except for
localhost development. Redirects are refused so a token stays on the selected instance.

To save credentials without putting the token in process arguments:

```sh
printf '%s' "$SNIPTIDE_TOKEN" | sniptide login --token-stdin
sniptide logout
```

Login validates the token before saving it. Commands never open a browser or prompt. Configuration
is saved as owner-only JSON at `$XDG_CONFIG_HOME/sniptide/config.json` (default
`~/.config/sniptide/config.json`). `SNIPTIDE_CONFIG` selects another file. Environment variables take
precedence over saved values, and `--base-url` takes precedence over the environment. Saved tokens
are only reused for their exact instance URL. Logout deletes saved credentials; an environment token
still applies.

## Install a collection as an agent skill

```sh
sniptide skill ui                                  # .claude/skills/ui/SKILL.md and snippets/
sniptide skill ui --agent cursor --name our-ui     # .cursor/skills/our-ui
sniptide skill ui --agent codex --force            # .agents/skills/ui, replacing earlier files
```

`SKILL.md` gets a description that names every paste and a section per paste that links its files,
which sit next to it under `snippets/<paste-slug>/`. `--dir` picks another skills folder and
`--dry-run` lists the files without writing them. A forced refresh replaces the files it writes and
keeps files from removed pastes, so delete the folder first for an exact copy.

## Restoring files and agent output

Pull validates every path and conflict before writing. It creates nested directories, refuses path
traversal and symbolic links, and refuses duplicate paths across a collection. Case collisions and
portable-path hazards (Windows drive letters, reserved names, backslashes) fail too. Existing regular
files are only replaced with `--force`. `--dry-run` lists paths and creates no files or directories.
A disk failure or concurrent filesystem change during writing may leave a partially restored tree;
a pull is not a filesystem transaction. Restore into a fresh directory for isolated review.

`--json` writes exactly one success object to stdout:

```json
{"ok":true,"data":{"directory":"/project","files":["src/Button.tsx"],"dryRun":false}}
```

Failures write one object to stderr, with stdout empty:

```json
{"ok":false,"error":{"code":"PATH_CONFLICT","message":"Output already exists: src/Button.tsx. Use --force to replace regular files."}}
```

Exit statuses are `0` for success, `1` for configuration/network/server/response/filesystem failures,
`2` for invalid input or path conflicts, and `3` for missing, invalid, or insufficiently scoped tokens.
API failures never print the token or the server's error body. Requests time out after 30 seconds;
responses are capped at 25 MiB. Pushes are never automatically retried, avoiding duplicate pastes.

`--dry-run` on push returns the proposed capture (including its code in JSON) without authentication
or network access. On pull it fetches the source and checks the destination but does not write.

## Env sync

Env groups hold a project's environment variables on your instance, encrypted at rest. Names are
1–64 lowercase letters, digits, `.`, `-` and `_`.

```sh
sniptide env push my-app                 # upload ./.env, replacing the group's variables
sniptide env pull my-app                 # write ./.env (0600); refuses to overwrite without --force
sniptide env pull my-app --stdout        # print it instead, e.g. into another tool
sniptide env run my-app -- bun dev       # run a command with the variables set
sniptide env list                        # groups and how many variables each holds
sniptide env delete my-app
```

`--file PATH` reads or writes another file than `.env`, and `--dry-run` shows what push or pull would
do without changing anything. Push reads dotenv syntax: `KEY=value`, an optional `export`, `#`
comments, single-quoted literals, and double-quoted values with `\n` escapes or line breaks.
Variables are not expanded. A push replaces the whole group, so a variable removed from the file is
removed from the group. `env run` puts the group's variables on top of the current environment,
passes stdio and signals through, and exits with the command's status (127 when it isn't found).

Values are never printed, in JSON output included, except by `env pull --stdout`. With `--json`,
push and pull report variable names only.
