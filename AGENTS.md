<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Commits and pull requests

Use [Conventional Commits](https://www.conventionalcommits.org/) for every commit message and every
pull request title: `type(scope): description`, with an imperative, lowercase description (for
example `feat(web): add paste collections`). A husky `commit-msg` hook runs commitlint, and
`.github/workflows/pr-title.yml` checks PR titles. See `CONTRIBUTING.md` for the allowed types.

# Project Management

Before coding, find or create the Linear issue (team WRK). Use its gitBranchName for the branch so the PR links automatically.
PR title keeps the repo’s Conventional Commits format with the ID at the end: 

<example>
feat(web): add paste collections (WRK-64).
</example>

Set the issue to In Progress when you start. When the PR opens, set In Review and comment the PR link. Verify Done after merge.