# Sniptide JavaScript SDK

The SDK wraps the authenticated `/api/v1` routes. Build and install from this repository until a registry release is available:

```sh
cd packages/sdk
bun run build
npm pack
npm install ./sniptide-sdk-0.1.0.tgz
```

```ts
import { SniptideClient, SniptideError } from "@sniptide/sdk"
const client = new SniptideClient(process.env.SNIPTIDE_TOKEN!)
const page = await client.listPastes({ limit: 20 })
const next = page.nextCursor && await client.listPastes({ cursor: page.nextCursor })
const { paste } = await client.createPaste({ title: "Example", files: [{ name: "hello.ts", content: "hello" }] })
```

`me`, `usage`, `readPaste`, `createPaste`, `updatePaste`, `updateSettings`, `trashPaste`, `listCollections`, `createCollection`, and `collectionPastes` return the API's JSON envelopes. The two create methods accept an optional idempotency key; current main ignores these keys; support requires a server version with idempotency enabled. Errors are `SniptideError` with `status`, `code`, and `retryAfter` where available. No requests are retried automatically. The optional second constructor argument is the instance base URL (including any path prefix), and the third is a fetch implementation. HTTPS is required except for loopback development. Redirects are rejected.

Before publishing, verify ownership and availability of `@sniptide/sdk`, configure npm credentials and provenance, run tests and inspect the packed artifact. No registry release is implied by this source package.

Environment group reads and writes return variable values, which can contain secrets. Handle responses accordingly. Listing groups returns counts, not values.

The response limit defaults to 64 MiB. Set the fourth constructor argument `maxResponseBytes` to a positive integer for a different limit.
