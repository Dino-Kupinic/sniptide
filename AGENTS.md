<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Commits and pull requests

Use [Conventional Commits](https://www.conventionalcommits.org/) for every commit message and every
pull request title: `type(scope): description`, with an imperative, lowercase description (for
example `feat(web): add paste collections`). A husky `commit-msg` hook runs commitlint, and
`.github/workflows/pr-title.yml` checks PR titles. See `CONTRIBUTING.md` for the allowed types.
