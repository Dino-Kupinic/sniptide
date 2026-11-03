# Sniptide CLI

Capture files from one project into a Sniptide paste with their folder structure, restore them in
another project, install a collection as an agent skill, and sync a project's `.env` file. The
`sniptide` command prints JSON on request and never prompts, so people and coding agents can both
run it. It works with Sniptide Cloud and self-hosted instances.

## Install

```sh
npm install --global @sniptide/cli
sniptide --version
```

The CLI needs Node.js 24 or newer and has no runtime dependencies. `--version` prints the installed
version.

## Connect your account

Create a personal API token in **Settings** > **API tokens**. A read-only token covers `pull`,
`list`, `search`, `skill`, `env list`, `env pull` and `env run`. `push`, `env push` and `env delete`
need **Write access**.

Pipe the token to `login` so that it never appears in the process list. Add `--base-url` for a
self-hosted instance:

```sh
printf '%s' "$SNIPTIDE_TOKEN" | sniptide login --token-stdin --base-url https://paste.example.com
```

```text
Logged in to https://paste.example.com.
```

`login` checks the token with the instance before it saves it to
`$XDG_CONFIG_HOME/sniptide/config.json`, which defaults to `~/.config/sniptide/config.json`. The
file is readable only by you, and `SNIPTIDE_CONFIG` picks another one. A saved token is used only
for the exact address it was saved for. `sniptide logout` deletes it.

You can also skip `login` and export `SNIPTIDE_TOKEN`, plus `SNIPTIDE_BASE_URL` for a self-hosted
instance. The environment takes precedence over saved values, and `--base-url` takes precedence over
the environment. The address must use HTTPS, except on `localhost`, and can include a path prefix.
The CLI refuses redirects, so the token never leaves the instance you chose.

## Capture and restore code

From the first project's root, capture a component:

```sh
sniptide push src/components/button --title 'Button' --collection ui --tag react
```

`push` prints the new paste's id and how many files it captured. From the second project's root,
restore it:

```sh
sniptide pull PASTE_ID --dir src/imported
```

The files land under `src/imported` with the same relative paths. `pull` also takes a paste link,
or `collection:<slug>` to restore a whole collection oldest capture first.

These rules decide what a push captures:

- `push` takes files, directories and quoted globs, and every pattern must match something.
- A paste holds up to 10 text files and 1 MiB. The CLI stops with an error instead of dropping files.
- Each file keeps its path relative to the directory you ran `push` in.
- Binary files, symbolic links, `.env` files, Git internals, build and dependency directories, and
  Git-ignored files are left out. Naming one of them explicitly is an error.
- `--lines 10:35` captures part of one file, counted from 1 and inclusive. A pull writes that part
  as a whole file.
- Inside a Git repository, the paste records the origin repository without credentials, the HEAD
  commit and whether the files differ from it.
- New pastes are private. `--visibility unlisted` or `--visibility public` shares one.
- `--collection` names a collection that already exists. The CLI doesn't create it.

`pull` fetches everything and checks every path before it writes a file. It refuses path traversal,
symbolic links, duplicate paths and paths that aren't portable across systems. It replaces an
existing file only with `--force`. A collection pull is limited to 1,000 pastes and 20 MiB. A disk
failure during the write can leave some files written, so restore into a fresh directory when you
want to review the result on its own.

`--dry-run` shows what `push` would capture without signing in, or what `pull` would write without
writing it.

To hand a capture to another machine without an account, write it to a bundle and read it back:

```sh
sniptide push src/components/button --title 'Button' --output /tmp/button.json
sniptide pull --input /tmp/button.json
```

The bundle is versioned JSON, readable only by you, and pulling it never replaces an existing file.

## Find pastes

```sh
sniptide search 'button' --language typescript --tag react --limit 20
sniptide list --collection ui --cursor CURSOR
```

`search` matches pastes where every word appears in the title, link, description, tags, a file path
or the code. Both commands return one page of your own live pastes. Pass the printed cursor to
`--cursor` for the next page. `--limit` is 1 to 100.

## Install a collection as an agent skill

```sh
sniptide skill ui
sniptide skill ui --agent cursor --name our-ui --dry-run
```

`skill` writes `SKILL.md` with a description and a section for each paste, and puts the files next
to it under `snippets/<paste-slug>/`. The agent loads the skill when a task needs it and reads only
the files it uses.

| Agent | Option | Folder |
| --- | --- | --- |
| Claude Code | none, the default | `.claude/skills/<name>` |
| Cursor | `--agent cursor` | `.cursor/skills/<name>` |
| Codex | `--agent codex` | `.agents/skills/<name>` |

The name defaults to the collection slug, and `--dir` picks another skills folder. To refresh the
skill, run the command again with `--force`. It replaces the files it writes and keeps files from
removed pastes, so delete the folder first for an exact copy.

## Sync .env files

Env groups hold a project's environment variables on your instance, encrypted at rest.

```sh
sniptide env push my-app              # upload ./.env and replace the group's variables
sniptide env pull my-app              # write ./.env with mode 0600
sniptide env pull my-app --stdout     # print the variables instead
sniptide env run my-app -- bun dev    # run a command with the variables set
sniptide env list
sniptide env delete my-app
```

- A push replaces the whole group, so a variable you removed from the file is removed from the group.
- `env pull` writes the group's revision as the file's first line. `env push` sends it back and is
  refused if the group changed since, so an old copy can't erase newer variables. Pull again, or
  push with `--force` to replace the group anyway.
- `env pull` doesn't overwrite an existing file without `--force`, and `--file` uses a file other
  than `.env`.
- The parser reads dotenv syntax: `KEY=value`, an optional `export`, `#` comments and quoted
  values. It doesn't expand variables.
- `env run` adds the group's variables to the current environment, passes signals through and exits
  with the command's status, or `127` when the command isn't found.
- Values are never printed, even in `--json` output, except by `env pull --stdout`.

Group names are 1 to 64 lowercase letters, digits, `.`, `-` and `_`. A group holds up to 500
variables, and an account up to 100 groups.

## Use the CLI from scripts and agents

With `--json` (`-j`), each command writes one JSON object. A success goes to standard output:

```json
{"ok":true,"data":{"directory":"/project","files":["src/Button.tsx"],"dryRun":false}}
```

A failure goes to standard error, and standard output stays empty:

```json
{"ok":false,"error":{"code":"PATH_CONFLICT","message":"Output already exists: src/Button.tsx. Use --force to replace regular files."}}
```

| Exit code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | A configuration, network, server, response or filesystem failure |
| `2` | Invalid input or a path conflict |
| `3` | The token is missing, invalid or lacks the access the command needs |

Requests time out after 30 seconds, and responses are capped at 25 MiB. Error messages never contain
the token or the server's error body. The CLI never retries a push, so a dropped connection can't
create a duplicate. After a timeout, check `sniptide list` before you push again.

Run `sniptide --help` for every command and option. The
[CLI documentation](https://docs.sniptide.com/cli) has the full command reference, and
[`API.md`](API.md) summarizes the token API calls the CLI makes.

## Develop the CLI

From the repository root, `bun run cli <command>` runs the source. To build the Node.js executable
that npm ships:

```sh
bun install
bun --filter @sniptide/cli build
node packages/cli/dist/sniptide.js --help
```

`bun run test:cli` runs the built executable against temporary projects and a local HTTP server.
`apps/web/test/cli-roundtrip.test.ts` runs it against the app's real route handlers and needs
`TEST_DATABASE_URL`.

## License

[MIT](LICENSE).
