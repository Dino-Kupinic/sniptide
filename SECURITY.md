# Security policy

## Report a vulnerability

Report security issues privately through
[GitHub's private vulnerability reporting](https://github.com/Dino-Kupinic/sniptide/security/advisories/new).
Don't open a public issue, discussion or pull request for a vulnerability, and don't use the
in-app feedback form, which can file public issues.

Include the affected version or URL, the steps to reproduce, and the impact you observed. The
maintainers aim to acknowledge a report within three business days and to share a fix plan once
the issue is confirmed. Fixes ship in a release with a GitHub security advisory that credits you,
unless you prefer to stay anonymous.

## Supported versions

Only the latest release receives security fixes. Self-hosted instances should
[upgrade](https://docs.sniptide.com/self-hosting/upgrading) to it.

## Scope

In scope are this repository's code: the web app, the API, the MCP server, the CLI, the SDKs and
the self-hosting setup. Test against your own account or your own instance. Don't access other
people's data, degrade the service or run automated scans against sniptide.com.

Known limits that the [security and threat model](https://docs.sniptide.com/security) page
already describes, such as paste content being readable by the server operator, are not
vulnerabilities on their own.
