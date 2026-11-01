# Sniptide JavaScript and TypeScript SDK

Use Sniptide from Node.js scripts, developer tools, and server applications. The official SDK provides typed access to snippets, collections, environment variable groups, and account usage through the Sniptide REST API.

## Install

```sh
npm install @sniptide/sdk
```

Requires Node.js 18 or later. The package uses ES modules and includes TypeScript declarations.

## Connect your account

Create a personal API token in [Sniptide Settings](https://app.sniptide.com/settings) with the scopes your application needs. Read operations require `read`; creating or changing data requires `write`. Keep tokens on the server and out of browser bundles and source control.

```ts
import { SniptideClient } from "@sniptide/sdk"

const client = new SniptideClient(process.env.SNIPTIDE_TOKEN!)
const page = await client.listPastes({ limit: 20 })

const { paste } = await client.createPaste({
  title: "Hello from the SDK",
  files: [{ name: "hello.ts", content: 'console.log("hello")' }],
})
```

## Available operations

| Area | Methods |
| --- | --- |
| Snippets | `listPastes`, `readPaste`, `createPaste`, `updatePaste`, `updateSettings`, `trashPaste` |
| Collections | `listCollections`, `createCollection`, `collectionPastes` |
| Environment variables | `listEnvGroups`, `readEnvGroup`, `writeEnvGroup`, `deleteEnvGroup` |
| Account | `me`, `usage` |

Methods return the API's JSON envelopes. For example, `readPaste` returns `{ paste }`, and list methods return pages with a `nextCursor` when more results are available.

```ts
const nextPage = page.nextCursor
  ? await client.listPastes({ cursor: page.nextCursor, limit: 20 })
  : null
```

`writeEnvGroup` replaces a group's variables. Environment group reads and writes return values that may contain secrets. Listing groups returns counts without exposing values.

## Self-hosted instances

Pass your instance URL as the second argument. A path prefix is supported.

```ts
const client = new SniptideClient(
  process.env.SNIPTIDE_TOKEN!,
  "https://snippets.example.com",
)
```

HTTPS is required except on loopback addresses. Redirects are rejected. You can supply a custom `fetch` implementation as the third argument and a positive response-size limit in bytes as the fourth. The default limit is 64 MiB.

## Errors and retries

```ts
import { SniptideError } from "@sniptide/sdk"

try {
  await client.me()
} catch (error) {
  if (error instanceof SniptideError) {
    console.error(error.status, error.code, error.retryAfter)
  }
  throw error
}
```

The SDK does not retry requests automatically. `createPaste` and `createCollection` accept an optional idempotency key as their second argument. Servers with idempotency support use that key to prevent duplicate creates; older instances may ignore it. Other mutations do not gain an automatic retry guarantee.

See the [API documentation](https://docs.sniptide.com) and [source repository](https://github.com/Dino-Kupinic/sniptide/tree/main/packages/sdk) for more details.

## License

[MIT](LICENSE).
