# Publish the SDKs

The **Publish SDKs** workflow publishes the checked-in version of either SDK from `main`.
Bump the relevant package version in a reviewed PR before each subsequent release.
An existing registry version cannot be replaced. A rerun after a successful upload fails rather
than overwriting that version.

For `@sniptide/sdk`, configure npm Trusted Publishing with owner `Dino-Kupinic`, repository
`sniptide`, workflow `publish-sdks.yml`, no environment, and permission for direct `npm publish`.
The first package publication requires an authenticated maintainer before npm package settings
are available.

For Python, add a PyPI pending publisher for project `sniptide`, owner `Dino-Kupinic`, repository
`sniptide`, workflow `publish-sdks.yml`, and no environment. If the project already exists, add
the publisher in that project's settings instead.

Open GitHub Actions, select **Publish SDKs**, choose `main`, and select `javascript` or `python`.
Each job runs the SDK checks and uploads its distribution files as workflow artifacts before
publishing with OIDC. No permanent registry token is required by the workflow.
