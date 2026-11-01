# Licensing

## Open-source core

The app and UI are licensed under [AGPL-3.0-only](LICENSE). The app includes pastes, collections,
revisions, secrets, the API, remote MCP, and OAuth, which you can run on your own instance.

The TypeScript SDK (`packages/sdk`), Python SDK (`packages/sdk-python`), CLI (`packages/cli`),
MCP package (`packages/mcp`), and shared schemas (`packages/contracts`) are licensed under
MIT. The CLI bundles Zod through the shared schemas and includes its license notice.

Existing published package versions are unchanged. New releases built from this source use
the package licenses described above.

## Hosted services

Sniptide operates a hosted service on its own domain, including remote MCP and OAuth. Operating
a service does not change the license of the underlying code. Hosted offerings may also include
discovery and indexing, a template gallery, short links, and paid extras. These offerings are not
a promise that every feature is currently available.

## Future enterprise code

Future enterprise code will live separately in an `ee/` directory under a separate commercial
license. This directory does not exist yet. This document does not grant a commercial license.
