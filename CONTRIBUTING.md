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

The release notes of each GitHub release are the changelog: they are generated from the commit
titles, so a clear title is the changelog entry. There is no `CHANGELOG.md`. A change that needs
something from people who run Sniptide (a new required setting, a manual step, a schema change the
previous version can't run against) is marked breaking, and its `BREAKING CHANGE:` paragraph says
what to do. Operators read the resulting policy in the docs, under Self-hosting, Versions and
releases (`apps/docs/content/docs/self-hosting/versions.mdx`).

If image publishing fails after the GitHub release was created, re-run the failed jobs or run
**Publish Docker image** manually with that existing release tag. Coolify continues deploying
`main` independently; publishing a release does not report a production deployment to GitHub.

## Database migrations

The schema and how to generate migrations are described in the [README](README.md#database). Beyond
that, a migration has to follow these rules, because every pending migration runs in one
transaction at startup and operators upgrade and restore databases with them:

- **Only statements Postgres can roll back.** A failed upgrade must leave the database as it was.
  `CREATE INDEX CONCURRENTLY`, `ALTER TYPE … ADD VALUE`, `VACUUM` and the like can't run in a
  transaction. `apps/web/test/migrations.test.ts` fails if a migration file uses one.
- **Additive where possible.** The previous version keeps serving while the new one starts. To
  remove something, stop using it in one release and drop it in a later one.
- **Never edit a migration that has been released.** Databases record migrations by name; add a
  new one instead.
- **Say so when it locks.** Adding an index or backfilling a large table blocks writes while it
  runs. Mention it in the PR so the release notes can warn operators.

Backups, restore and upgrades are covered by `scripts/test-upgrade.sh`, which CI runs against the
latest release on every pull request. It seeds a stack on that release, backs it up, upgrades it to
the new build, and restores the backup into the running stack and into a new one, comparing the
data each time. Run it locally with two images when you change migrations, the backup scripts or
startup:

```bash
bash scripts/test-upgrade.sh ghcr.io/dino-kupinic/sniptide:0.12.4 sniptide:local
```
