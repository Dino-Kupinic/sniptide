// The OpenAPI document behind the API reference at /docs/api, served as JSON from
// /api/openapi.json. It is written by hand next to the routes it describes, and
// test/openapi.test.ts fails when a route handler exists that this file neither documents nor lists
// as internal, so a new endpoint can't ship without a reference entry.

const slugParameter = {
  name: "slug",
  in: "path",
  required: true,
  description: "The paste's share link slug: the part of the link after the domain.",
  schema: { type: "string", pattern: "^[A-Za-z0-9_-]{3,40}$", examples: ["k7Qe2x"] },
} as const

const textError = (description: string, example: string) =>
  ({
    description,
    content: { "text/plain": { schema: { type: "string" }, example } },
  }) as const

const jsonError = (description: string, example: string) =>
  ({
    description,
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/Failure" },
        example: { ok: false, error: example },
      },
    },
  }) as const

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Sniptide HTTP API",
    version: "1.0.0",
    summary: "The endpoints Sniptide serves to the public.",
    description: [
      "Everything a share link does over HTTP: reading a paste's files as plain text, unlocking a",
      "password-protected paste and revealing a burn-after-read one, plus the health and metrics",
      "endpoints that self-hosters point their monitoring at.",
      "",
      "Creating and managing pastes over HTTP isn't available yet. When API tokens ship, those",
      "endpoints will be documented here.",
      "",
      "The app's own endpoints (sign-in, search, analytics) belong to the web app, answer only to a",
      "signed-in browser session, and can change without notice, so they aren't part of this",
      "reference.",
      "",
      "Every endpoint works the same on Sniptide Cloud and on a self-hosted instance. The examples",
      "on this page use the server you opened it on; in the downloaded document the host is a",
      "variable you can set.",
    ].join("\n"),
    license: {
      name: "AGPL-3.0",
      url: "https://github.com/Dino-Kupinic/sniptide/blob/main/LICENSE",
    },
  },
  servers: [
    {
      url: "https://{host}",
      description: "Sniptide Cloud, or your own instance",
      variables: {
        host: {
          default: "sniptide.com",
          description: "The domain share links use. A self-hosted instance uses its own.",
        },
      },
    },
  ],
  tags: [
    {
      name: "Pastes",
      description:
        "Reading a shared paste. A paste is reachable by its slug when it is public or unlisted; a private paste answers 404 to everyone but its owner.",
    },
    {
      name: "Operations",
      description: "For uptime checks and monitoring of a self-hosted instance.",
    },
  ],
  paths: {
    "/{slug}/raw": {
      get: {
        operationId: "getRawFile",
        tags: ["Pastes"],
        summary: "Read a file as plain text",
        description: [
          "Returns the content of one file of a paste as `text/plain`.",
          "",
          "Without `file`, or when no file has that name, the paste's first file is returned.",
          "Burn-after-read pastes never answer here, and neither do pastes whose owner switched",
          "raw access off. The owner, signed in, can always read their own pastes.",
          "",
          "A password-protected paste answers 401 until the visitor has unlocked it (see",
          "`POST /{slug}/unlock`); send the cookie that call sets.",
        ].join("\n"),
        parameters: [
          slugParameter,
          {
            name: "file",
            in: "query",
            required: false,
            description: "The file's name, as shown on the share page. Defaults to the first file.",
            schema: { type: "string", examples: ["schema.sql"] },
          },
          {
            name: "download",
            in: "query",
            required: false,
            description:
              "Present with any value (`?download=1`), the response is sent as an attachment named after the file instead of shown in the browser.",
            schema: { type: "string", examples: ["1"] },
          },
        ],
        responses: {
          "200": {
            description: "The file's content.",
            headers: {
              "Content-Disposition": {
                description: "Only with `download`.",
                schema: { type: "string", examples: ["attachment; filename*=UTF-8''schema.sql"] },
              },
              "Cache-Control": { schema: { type: "string", const: "private, no-store" } },
            },
            content: {
              "text/plain": {
                schema: { type: "string" },
                example: "create table paste (\n  id uuid primary key,\n  slug text not null\n);\n",
              },
            },
          },
          "401": textError(
            "The paste is password protected and this visitor hasn't unlocked it.",
            "This paste is password protected",
          ),
          "403": textError(
            "Raw access is off for this paste, or it is a burn-after-read paste.",
            "Raw access is off for this paste",
          ),
          "404": textError(
            "No such paste: it doesn't exist, has expired, was deleted, or is private.",
            "Not found",
          ),
        },
      },
    },
    "/{slug}/unlock": {
      post: {
        operationId: "unlockPaste",
        tags: ["Pastes"],
        summary: "Unlock a password-protected paste",
        description: [
          "Checks the password and, when it is right, sets an `HttpOnly` cookie that opens this",
          "paste for 24 hours. Send that cookie on later requests to the paste's pages and",
          "`/{slug}/raw`. Changing the paste's password invalidates the cookie.",
          "",
          "Wrong passwords are rate limited: 8 attempts per visitor per 15 minutes and 60 per paste",
          "per hour. A correct password gives its attempt back. A paste that doesn't exist, is",
          "private, or has no password answers the same as a wrong password.",
        ].join("\n"),
        parameters: [slugParameter],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["password"],
                properties: {
                  password: {
                    type: "string",
                    maxLength: 200,
                    description: "The paste's password.",
                  },
                },
              },
              example: { password: "hunter22" },
            },
          },
        },
        responses: {
          "200": {
            description: "The password is right. The unlock cookie is in `Set-Cookie`.",
            headers: {
              "Set-Cookie": {
                description: "The unlock cookie: `HttpOnly`, `SameSite=Lax`, valid for 24 hours.",
                schema: { type: "string" },
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Success" },
                example: { ok: true },
              },
            },
          },
          "400": jsonError(
            "The password is longer than 200 characters.",
            "That password is too long.",
          ),
          "401": jsonError(
            "The password is wrong, or the paste can't be unlocked.",
            "That password isn't right.",
          ),
          "413": jsonError("The request body is larger than 1 KB.", "That request is too large."),
          "429": {
            description: "Too many attempts.",
            headers: {
              "Retry-After": {
                description: "Seconds until the next attempt is allowed.",
                schema: { type: "integer", examples: [840] },
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Failure" },
                example: { ok: false, error: "Too many attempts. Try again in a few minutes." },
              },
            },
          },
        },
      },
    },
    "/{slug}/reveal": {
      post: {
        operationId: "revealPaste",
        tags: ["Pastes"],
        summary: "Reveal a paste's files",
        description: [
          "Returns every file of the paste as JSON. This is what the share page calls when a visitor",
          "presses _Reveal_ on a burn-after-read paste.",
          "",
          "**Revealing a burn-after-read paste uses it up:** the first visitor gets the files, and",
          "everyone after them gets 404. Only `POST` reveals, so link previews and scanners that",
          "fetch the share page with `GET` can't burn the paste. The owner, signed in, can reveal",
          "their own paste without burning it.",
          "",
          "A password-protected paste answers 401 until it has been unlocked.",
        ].join("\n"),
        parameters: [slugParameter],
        responses: {
          "200": {
            description: "The paste's files.",
            headers: {
              "Cache-Control": { schema: { type: "string", const: "private, no-store" } },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RevealedPaste" },
                example: {
                  ok: true,
                  title: "Deploy notes",
                  files: [
                    {
                      name: "deploy.sh",
                      language: "bash",
                      content: "docker compose pull\ndocker compose up -d\n",
                    },
                  ],
                },
              },
            },
          },
          "401": jsonError(
            "The paste is password protected and hasn't been unlocked.",
            "Unlock the paste first.",
          ),
          "404": jsonError(
            "The paste doesn't exist, has expired, or was already read.",
            "This paste is gone. Someone already read it.",
          ),
        },
      },
    },
    "/api/health": {
      get: {
        operationId: "getHealth",
        tags: ["Operations"],
        summary: "Check that the server and database are up",
        description:
          "Runs a trivial query. Point an uptime check or a container health check at it.",
        responses: {
          "200": {
            description: "The server is up and the database answers.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Success" },
                example: { ok: true },
              },
            },
          },
          "503": {
            description: "The database doesn't answer.",
            content: {
              "application/json": {
                schema: { type: "object", required: ["ok"], properties: { ok: { const: false } } },
                example: { ok: false },
              },
            },
          },
        },
      },
    },
    "/api/openapi.json": {
      get: {
        operationId: "getOpenApiDocument",
        tags: ["Operations"],
        summary: "Download this API description",
        description:
          "This reference as an OpenAPI 3.1 document, for generating clients or loading into a tool like Postman.",
        responses: {
          "200": {
            description: "The OpenAPI document.",
            content: {
              "application/json": {
                schema: { type: "object" },
                example: {
                  openapi: "3.1.0",
                  info: { title: "Sniptide HTTP API", version: "1.0.0" },
                },
              },
            },
          },
        },
      },
    },
    "/api/metrics": {
      get: {
        operationId: "getMetrics",
        tags: ["Operations"],
        summary: "Read the server's metrics",
        description: [
          "Request timings, event loop delay, memory, database size and connections, and how many",
          "expired pastes are waiting to be purged.",
          "",
          "Off until you set `METRICS_TOKEN` on the server: without it the endpoint answers 404.",
          "Authenticate with that value as a bearer token.",
        ].join("\n"),
        security: [{ metricsToken: [] }],
        responses: {
          "200": {
            description: "A snapshot of the metrics.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Metrics" },
                example: {
                  uptimeSeconds: 86412.7,
                  memory: {
                    rss: 218103808,
                    heapTotal: 94371840,
                    heapUsed: 71254016,
                    external: 4410221,
                    arrayBuffers: 168402,
                  },
                  cpu: { user: 41820000, system: 9120000 },
                  eventLoop: { p99Ms: 21.3, maxMs: 64.8 },
                  latencyBucketUpperBoundsMs: [10, 50, 100, 250, 500, 1000, 3000, 10000, null],
                  metrics: {
                    "db:select": {
                      count: 1840,
                      errors: 0,
                      sumMs: 6120.4,
                      maxMs: 212.5,
                      buckets: [1502, 301, 28, 7, 2, 0, 0, 0, 0],
                    },
                  },
                  maintenance: {
                    lastRunAt: 1791806400000,
                    durationMs: 38.2,
                    batches: 1,
                    trashed: 3,
                    expired: 9,
                    historyRows: 140,
                    exhausted: true,
                  },
                  database: {
                    bytes: 18874368,
                    connections: 6,
                    lock_waiters: 0,
                    active_connections: 1,
                  },
                  purgeBacklog: { pastes: 0 },
                },
              },
            },
          },
          "401": textError("The bearer token is missing or wrong.", "Unauthorized"),
          "404": textError("`METRICS_TOKEN` isn't set on this server.", "Not found"),
        },
      },
    },
  },
  components: {
    securitySchemes: {
      metricsToken: {
        type: "http",
        scheme: "bearer",
        description: "The server's `METRICS_TOKEN`, a long random string you choose.",
      },
    },
    schemas: {
      Success: {
        type: "object",
        required: ["ok"],
        properties: { ok: { const: true } },
      },
      Failure: {
        type: "object",
        required: ["ok", "error"],
        properties: {
          ok: { const: false },
          error: { type: "string", description: "A sentence fit to show to a visitor." },
        },
      },
      RevealedPaste: {
        type: "object",
        required: ["ok", "title", "files"],
        properties: {
          ok: { const: true },
          title: { type: "string" },
          files: {
            type: "array",
            description: "In the order the owner arranged them.",
            items: {
              type: "object",
              required: ["name", "language", "content"],
              properties: {
                name: { type: "string", examples: ["deploy.sh"] },
                language: {
                  type: "string",
                  description: "The language the owner chose, as used for highlighting.",
                  examples: ["bash"],
                },
                content: { type: "string" },
              },
            },
          },
        },
      },
      Metrics: {
        type: "object",
        description:
          "Shaped for a monitoring script, not a stable contract: fields can be added between releases.",
        required: [
          "uptimeSeconds",
          "memory",
          "cpu",
          "eventLoop",
          "latencyBucketUpperBoundsMs",
          "metrics",
          "maintenance",
          "database",
          "purgeBacklog",
        ],
        properties: {
          uptimeSeconds: { type: "number" },
          memory: {
            type: "object",
            description: "Node's `process.memoryUsage()`, in bytes.",
            additionalProperties: { type: "number" },
          },
          cpu: {
            type: "object",
            description: "Node's `process.cpuUsage()`, in microseconds.",
            additionalProperties: { type: "number" },
          },
          eventLoop: {
            type: "object",
            required: ["p99Ms", "maxMs"],
            properties: { p99Ms: { type: "number" }, maxMs: { type: "number" } },
          },
          latencyBucketUpperBoundsMs: {
            type: "array",
            description:
              "Upper bound of each latency bucket in milliseconds; `null` is the last, open one.",
            items: { type: ["number", "null"] },
          },
          metrics: {
            type: "object",
            description: "Timings by name (routes, actions and database calls).",
            additionalProperties: {
              type: "object",
              required: ["count", "errors", "sumMs", "maxMs", "buckets"],
              properties: {
                count: { type: "integer" },
                errors: { type: "integer" },
                sumMs: { type: "number" },
                maxMs: { type: "number" },
                buckets: {
                  type: "array",
                  description:
                    "Calls per latency bucket, in the order of `latencyBucketUpperBoundsMs`.",
                  items: { type: "integer" },
                },
              },
            },
          },
          maintenance: {
            type: "object",
            description: "Results of the last background maintenance run.",
            additionalProperties: { type: ["number", "boolean"] },
          },
          database: {
            type: "object",
            required: ["bytes", "connections", "lock_waiters", "active_connections"],
            properties: {
              bytes: { type: "number", description: "Size of the database." },
              connections: { type: "integer" },
              lock_waiters: { type: "integer", description: "Connections waiting on a lock." },
              active_connections: { type: "integer", description: "Connections running a query." },
            },
          },
          purgeBacklog: {
            type: "object",
            required: ["pastes"],
            properties: {
              pastes: {
                type: "integer",
                description:
                  "Pastes deleted or expired over 30 days ago that haven't been purged yet.",
              },
            },
          },
        },
      },
    },
  },
} as const

// Route handlers that belong to the web app rather than to the public API. They answer only to
// the signed-in browser session, or are another library's, so the reference leaves them out. A
// route handler that is in neither this list nor the document fails test/openapi.test.ts.
export const internalRoutes = [
  "/[slug]/copy",
  "/analytics/export",
  "/api/analytics",
  "/api/analytics/[...path]",
  "/api/auth/[...all]",
  "/api/search",
  "/api/stats",
] as const
