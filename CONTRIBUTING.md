# Contributing

Setup and the checks live in the [README](README.md). This page covers how we write commits and
pull requests.

## Conventional Commits

Sniptide uses [Conventional Commits](https://www.conventionalcommits.org/). Every commit message
and every pull request title looks like this:

```
<type>(<optional scope>): <description>
```

```
feat(web): add paste collections
fix(auth): stop sessions leaking across subdomains
docs: explain the SHARE_URL setting
refactor(db)!: rename the pastes table
```

- **type** is one of `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`,
  `chore` or `revert`. Use `feat` for something users can do that they couldn't before and `fix`
  for a bug; the rest don't change behavior.
- **scope** is optional. It names the part of the repo that changed, such as `web`, `ui`, `db`,
  `auth`, `deps` or `docker`.
- **description** is imperative, lowercase at the start, and has no trailing period ("add",
  not "Added" or "Adds"). Keep the whole first line under 100 characters.
- A breaking change gets a `!` after the type or scope, and a `BREAKING CHANGE:` paragraph in the
  body that says what to do about it.

## How it's enforced

- A `commit-msg` hook ([husky](https://typicode.github.io/husky/) running
  [commitlint](https://commitlint.js.org/)) rejects a commit message that doesn't follow the
  format. `bun install` sets the hook up. The rules are in `commitlint.config.mjs`.
- Pull requests are squash-merged, so the PR title becomes the commit on `main`.
  `.github/workflows/pr-title.yml` checks the title and fails the PR if it isn't conventional.
  The commits inside a PR are squashed away, but the hook keeps them tidy while you work.

History from before this convention (everything up to the commit that introduced it) uses plain
sentences. It is left as it is: rewriting `main` would change every hash and break links, forks
and open PRs.

## Pull requests

- Keep a PR to one change, and say in the description what it does and why.
- Run the checks from the README before pushing; CI runs the same ones.

## Releases

Merging a PR into `main` automatically publishes a GitHub release after its CI passes. The
Conventional Commit title determines the version: `feat` bumps the minor version, `fix` and
other types bump the patch version, and `!` or a `BREAKING CHANGE:` footer bumps the major
version. Changes since the previous tag are included in the release notes. No manual version
bump or tag is needed; the private root package version is not the release version.

The release workflow then builds, smoke-tests and publishes the matching AMD64/ARM64 Docker
image, including its version tags and `latest`. A failed CI run never publishes a release.
If another PR merges before a release starts, the older run is skipped; the next passing run
at the tip of `main` releases the accumulated changes together. Direct pushes do not start
a release. Re-running a successful release does not create another version.

If image publishing fails after the GitHub release was created, re-run the failed jobs or run
**Publish Docker image** manually with that existing release tag. Coolify continues deploying
`main` independently; publishing a release does not report a production deployment to GitHub.
