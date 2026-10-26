# Publishing the CLI and MCP packages

The first releases are pending npm owner approval. Each package has its own version in
`packages/cli/package.json` or `packages/mcp/package.json`. Bump the relevant version for every
changed release artifact. Once a version is public, npm cannot replace it, even if only the code
changes. The private workspace manifests remain the source for web imports; the release packer
creates bin-only public manifests and bundles the internal contracts.

On main, the Stage CLI and MCP packages workflow builds and smoke tests both installed packages,
then uploads each tarball and its integrity metadata before staging it with npm provenance. Review
that artifact and the source commit before approving. The package jobs are independent and the
workflow can also be dispatched manually.

Use Node.js 24.15 or newer and npm 12.2.1 for the maintainer commands below.
For the first release, the npm owner must log in locally with `npm login`, pack the reviewed commit
with `node scripts/npm-release.mjs cli <output-directory>` or `mcp`, and use
`npm stage publish <tarball> --access public`. Inspect with `npm stage list` and `npm stage view`,
then approve the reviewed stage using `npm stage approve <id>` with 2FA. If the package must exist
before npm permits trusted publisher configuration, complete this bootstrap first. Configure each
package's trusted publisher on npm with GitHub owner `Dino-Kupinic`, repository `sniptide`, workflow
filename `publish-tools.yml`, and no environment. Grant staging permission. No long-lived token is
needed in GitHub Actions.

A published exact version is skipped. An existing pending stage can reserve the version and cause
staging to fail. OIDC cannot list stages. The owner must inspect the pending stage and either approve
it or reject it before retrying. Do not assume a failed stage is a successful release. After
approval, verify `npm view @sniptide/cli@<version>` or `npm view @sniptide/mcp@<version>` and test
installation. A changed artifact needs a new version after publication.

After the MCP package is publicly approved, dispatch **Publish MCP Registry metadata** with its exact
npm version. It verifies the public tarball's integrity and included metadata before GitHub OIDC
login. It publishes under `io.github.dino-kupinic/sniptide`; an existing matching version is a no-op
and mismatched metadata fails. Verify the exact version in the official MCP Registry. Pending npm
stages are not public and cannot pass this gate.
