<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Work loop

Follow [Make an agent change reviewable](docs/development.md#make-an-agent-change-reviewable) for
every change. In short: test the behavior, update the documentation in the same pull request, run
`bun run verify`, review your own diff, and watch CI until it passes.

- Documentation lives in `apps/docs/content/docs`. Write it with
  [the documentation style guide](docs/documentation-style-guide.md), and use
  [Update the documentation](docs/development.md#update-the-documentation) to find the page a
  change affects.
- `bun run test:docs` fails when a page links to a missing heading, or when an environment
  variable, MCP tool, CLI command, or `/api/v1` route has no documentation. Document the item
  instead of loosening the check.
- Report what you verified and what you couldn't, such as database tests without
  `TEST_DATABASE_URL`. State a claim you couldn't verify as unverified rather than guessing.

# Context discipline

- Read the relevant functions and documentation sections first. Expand to whole files when the
  surrounding context is needed, and reuse unchanged material already read in the chat.
- Keep tool results compact: select needed fields from API responses and bound search output.
  Narrow a query when output is truncated so required evidence is still inspected.
- Capture verbose test and build output in an owned temporary log. Return the exit status,
  summary, and relevant failures; inspect more of the log when diagnosing a failure.
- Batch independent reads and checks. Repeat a passing check when changes or unresolved concerns
  justify it, and use bounded waits for CI instead of frequent polling.
- Inspect screenshots at the sizes and states needed to verify the change; avoid repeating
  unchanged captures. Hand off long tasks with a concise record of decisions and remaining work.
- These rules reduce repeated context; all required tests, documentation, review, CI, and cleanup
  checks still apply.

# Commits and pull requests

Use [Conventional Commits](https://www.conventionalcommits.org/) for every commit message and every
pull request title: `type(scope): description`, with an imperative, lowercase description (for
example `feat(web): add paste collections`). A husky `commit-msg` hook runs commitlint, and
`.github/workflows/pr-title.yml` checks PR titles. See `CONTRIBUTING.md` for the allowed types.

# Code graph

Graphify is optional, and these steps apply when `graphify` is on your PATH. If `graphify-out/graph.json` is missing, run `graphify update .` once. It parses the code locally in a few seconds and sends nothing to a model.

When the graph exists, run `graphify query "<question>"` before a broad search to find the files that matter, then read those files before you change them. `graphify path "<A>" "<B>"` shows how two symbols connect, and `graphify explain "<symbol>"` describes one. Use grep directly when you are looking for exact text.

The graph can lag behind your branch, so the source files decide what is true. `graphify-out/` stays out of git.

# Project Management

Before coding, find or create the Linear issue (team WRK). Use its gitBranchName for the branch so the PR links automatically.
PR title keeps the repo’s Conventional Commits format with the ID at the end: 

<example>
feat(web): add paste collections (WRK-64).
</example>

Set the issue to In Progress when you start. When the PR opens, set In Review and comment the PR link. Verify Done after merge.
