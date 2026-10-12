# Sniptide CLI

One CLI for people and coding agents to capture code, preserve its folder structure, and reuse it in
another project. This is the WRK-115 client foundation. **Remote commands are not usable against the
current Sniptide app yet:** WRK-106 must supply scoped personal tokens, and the server must implement
the proposed [CLI API contract](API.md). The integration suite uses a local contract server, not the
production service. Offline bundle export and import work now.

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

This package is private while the server contract is pending; it is not published to npm. During
local development, `bun run cli <command>` runs the source, and `bun run test:cli` runs the built
Node executable against temporary projects and a local HTTP server.

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
unsafe paths fail. This CLI transfers code; env files belong to the future `env` commands.

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

## Connect to an instance when the API is available

```sh
export SNIPTIDE_TOKEN='your-scoped-api-token'
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

WRK-111 will add `sniptide env push`, `sniptide env pull`, and `sniptide env run -- <command>` to this
same executable. No separate env CLI is created. Until then, `sniptide env` returns
`NOT_IMPLEMENTED`; it never treats secrets as ordinary code captures.
