# Automatic npm releases

Merging a PR into `main` releases changed public packages after CI passes. The app and the three
npm packages have independent versions. No manual package version bump, release PR, or npm stage
approval is needed for normal releases.

The `Release` workflow is the only npm publisher. Its package jobs compare the current packed
contents with the highest stable public version of `@sniptide/ui`, `@sniptide/cli`, and
`@sniptide/mcp`. Files and resolved dependencies count. An unrelated app change or a change to
source commit metadata alone does not publish another package version.

For a changed package, relevant Conventional Commits since its published source determine the
bump. `feat` selects minor, a breaking change selects major, and other changes select patch.
Dependency changes without a package commit select patch. The first automatic run uses verified
source baselines for the existing releases, so it includes the UI changes since `0.1.1`.

The checked-in package versions are development defaults. CI injects the computed version when
building the CLI and MCP executable and writes the same version into the public package and MCP
metadata. Source workspace manifests and imports remain usable by the app. Published metadata
records the source commit in `gitHead`; CI does not push version commits back to `main`.

Before publication, CI installs the exact generated tarball in an isolated consumer. It checks
CLI/MCP commands and protocol behavior, or UI TypeScript imports, rendering, theme compilation,
and fonts. Direct npm Trusted Publishing adds provenance without a permanent npm token.

## Configure npm once

For each of `@sniptide/ui`, `@sniptide/cli`, and `@sniptide/mcp`, configure a GitHub trusted publisher:

- Owner `Dino-Kupinic`.
- Repository `sniptide`.
- Workflow filename `release.yml`.
- No environment name.
- Allow direct `npm publish`.

The npm publish steps are directly in `release.yml`, so there is no reusable-workflow identity to
configure. The previous `publish-ui.yml` and `publish-tools.yml` workflows are removed. An old
stage-only trusted publisher does not authorize automatic direct publication. Use npm's package
settings to add the configuration, or run this with npm 12.2.1 and complete its owner 2FA flow:

```sh
npm trust github @sniptide/ui --repo Dino-Kupinic/sniptide --file release.yml --allow-publish --yes
npm trust github @sniptide/cli --repo Dino-Kupinic/sniptide --file release.yml --allow-publish --yes
npm trust github @sniptide/mcp --repo Dino-Kupinic/sniptide --file release.yml --allow-publish --yes
```

See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) for package permissions.
First publication must succeed within npm's trusted-publisher configuration expiry window.

## Retry a failed release

Rerun failed package jobs, or dispatch **Release** on `main`. A manual run still verifies that the
current commit came from a merged PR and passed push CI. It cannot publish an arbitrary branch.
Package jobs run even when the app release already exists. Each package job is independent.

Public npm contents are the durable record. If npm accepted an artifact before a job failed, the
next run recognizes its contents and does not bump or publish it again. An existing version with
different integrity is a conflict, and network or authorization errors fail the job. No package
version tag is required for recovery.

The MCP Registry job reconciles every stable public MCP version, including versions whose npm
publication succeeded before registry publication failed. It verifies each public tarball and its
included `server.json`, then publishes missing metadata through GitHub OIDC. Matching registry
records are left intact. To retry only one version, dispatch **Publish MCP Registry metadata** with
that public version, or leave the input empty to reconcile all public versions.

## Inspect a local release plan

```sh
node scripts/package-releases.mjs ui artifacts/npm/ui-preview
```

This reads npm and generates a plan and tarball. It does not publish. The same command accepts
`cli` and `mcp`. An older package without `gitHead` needs an explicitly verified source baseline
before its next changed release. Unknown baselines fail rather than guessing.

The separate website currently accepts `@sniptide/ui` versions matching `^0.1.1`. A `0.2.0` UI
release requires an intentional website dependency update. Compatible releases also require its
lockfile to be refreshed; npm publication alone does not redeploy that repository.
