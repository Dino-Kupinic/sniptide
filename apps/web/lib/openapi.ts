import {
  apiCaptureSchema,
  apiPasteSchema,
  apiPasteSummarySchema,
  mcpCaptureSchema,
  responseFileSchema,
  sourceSchema,
} from "@sniptide/contracts"
import { z } from "zod"

function jsonSchema(schema: z.ZodType) {
  const { $schema, ...fields } = z.toJSONSchema(schema, { io: "input" })
  return fields
}

const captureInput = jsonSchema(apiCaptureSchema)
const captureProperties = {
  ...captureInput.properties,
  title: jsonSchema(mcpCaptureSchema.shape.title),
  description: { ...jsonSchema(mcpCaptureSchema.shape.description), default: "" },
  collection: {
    ...jsonSchema(apiCaptureSchema.shape.collection),
    description: "An existing collection's slug.",
  },
  tags: {
    ...jsonSchema(apiCaptureSchema.shape.tags),
    description: "Stored lowercase, without duplicates.",
  },
  source: { $ref: "#/components/schemas/Source" },
  files: {
    ...jsonSchema(apiCaptureSchema.shape.files),
    items: { $ref: "#/components/schemas/CaptureFile" },
  },
}
const pasteInput = jsonSchema(apiPasteSchema)
const pasteProperties = {
  id: { type: "string", format: "uuid" },
  url: { type: "string", description: "The share link." },
  source: { $ref: "#/components/schemas/Source" },
  createdAt: { type: "string", format: "date-time" },
  updatedAt: { type: "string", format: "date-time" },
  expiresAt: { type: ["string", "null"], format: "date-time" },
}
const fileProperties = {
  ...jsonSchema(responseFileSchema).properties,
  name: {
    ...jsonSchema(mcpCaptureSchema.shape.files.element.shape.name),
    description: "A relative path, kept when the paste is pulled into another project.",
    examples: ["src/components/button.tsx"],
  },
  language: { type: "string", examples: ["typescript"] },
  lines: {
    ...jsonSchema(responseFileSchema.shape.lines),
    description: "The source lines a capture took, 1-based and inclusive. Absent for a whole file.",
  },
}

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

const tokenErrors = {
  "401": jsonError(
    "The token is missing, wrong, expired or revoked.",
    "The API token is missing, invalid, expired or revoked.",
  ),
  "403": jsonError(
    "The token doesn't have the scope this needs.",
    "This token doesn't have the write scope.",
  ),
  "429": {
    ...jsonError(
      "The token made too many requests. Retry after `Retry-After` seconds.",
      "Too many requests. Slow down.",
    ),
    headers: { "Retry-After": { schema: { type: "integer" } } },
  },
} as const

const envGroupParameter = {
  name: "group",
  in: "path",
  required: true,
  description: "The env group's name: lowercase letters, digits, dots, - and _.",
  schema: { type: "string", pattern: "^[a-z0-9][a-z0-9._-]{0,63}$", examples: ["my-app"] },
} as const

const envExample = {
  slug: "my-app",
  updatedAt: "2026-10-13T08:02:11.000Z",
  variables: [
    { name: "DATABASE_URL", value: "postgres://app:secret@db:5432/app" },
    { name: "STRIPE_KEY", value: "replace-with-your-key" },
  ],
}

const pasteFields = {
  id: "5f0c6a52-8a1e-4c55-9a3f-1f7d0f7c2b11",
  slug: "k7Qe2x",
  url: "https://sniptide.com/k7Qe2x",
  title: "Button",
  description: "Reusable button and hook",
  visibility: "private",
  collection: "ui",
  tags: ["react", "component"],
  source: {
    repository: "https://github.com/example/project.git",
    commit: "0123456789abcdef0123456789abcdef01234567",
    dirty: false,
  },
  createdAt: "2026-10-13T08:02:11.000Z",
  updatedAt: "2026-10-13T08:02:11.000Z",
  expiresAt: null,
}

const pasteFiles = [
  {
    name: "src/components/button.tsx",
    language: "typescript",
    content: "export const Button = () => <button>Go</button>\n",
  },
  {
    name: "src/hooks/use-press.ts",
    language: "typescript",
    content: "export const usePress = () => {}\n",
    lines: { start: 10, end: 10 },
  },
]

const pasteExample = {
  paste: { ...pasteFields, files: pasteFiles },
  summary: { ...pasteFields, languages: ["typescript"], bytes: 81 },
  capture: {
    title: "Button",
    description: "Reusable button and hook",
    visibility: "private",
    collection: "ui",
    tags: ["react", "component"],
    source: pasteFields.source,
    files: pasteFiles,
  },
}

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
      "With a personal API token (Settings → API tokens) the `/api/v1` endpoints capture code as",
      "pastes, list and pull your pastes and collections, and sync env groups. They are what the",
      "`sniptide` CLI calls, and coding agents can call them directly.",
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
      name: "Token API",
      description:
        "Your own pastes and collections, for the `sniptide` CLI, agents and scripts. Authenticate with a personal API token from Settings → API tokens. Reads need the read scope, creating needs write.",
    },
    {
      name: "MCP",
      description: "Coding agent tools over Streamable HTTP, authenticated by personal API token.",
    },
    {
      name: "Env",
      description:
        "Env groups: environment variables synced with `.env` files by `sniptide env`. Values are encrypted at rest.",
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
    "/api/mcp": {
      post: {
        operationId: "mcpRequest",
        tags: ["MCP"],
        summary: "Call the Sniptide MCP server",
        description:
          "Stateless Streamable HTTP with JSON responses. Connect your MCP client to this URL with a personal API token. Tools: search_snippets, read_snippet, fetch_collection, create_snippet and update_snippet. Reads need read scope; writes also need write scope. No OAuth discovery or SSE sessions. See packages/mcp/README.md for client configuration.",
        security: [{ apiToken: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object" },
              example: { jsonrpc: "2.0", id: 1, method: "tools/list" },
            },
          },
        },
        responses: {
          "200": {
            description: "An MCP JSON-RPC response (tool failures use isError).",
            content: {
              "application/json": {
                schema: { type: "object" },
                example: { jsonrpc: "2.0", id: 1, result: { tools: [] } },
              },
            },
          },
          "202": { description: "Notification accepted, no response body." },
          "400": { description: "Invalid JSON-RPC message or protocol version." },
          "406": { description: "Accept must include application/json and text/event-stream." },
          "413": { description: "Request exceeds 8 MiB." },
          "415": { description: "Content-Type must be application/json." },
          ...tokenErrors,
        },
      },
      get: {
        operationId: "mcpStream",
        tags: ["MCP"],
        summary: "Check MCP stream support",
        security: [{ apiToken: [] }],
        responses: {
          "405": { description: "No standalone SSE stream; use POST." },
          ...tokenErrors,
        },
      },
      delete: {
        operationId: "mcpDeleteSession",
        tags: ["MCP"],
        summary: "Check MCP session deletion support",
        security: [{ apiToken: [] }],
        responses: { "405": { description: "No sessions to delete; use POST." }, ...tokenErrors },
      },
    },
    "/api/v1/me": {
      get: {
        operationId: "getTokenOwner",
        tags: ["Token API"],
        summary: "Check a token",
        description:
          "Who the token acts for and its scopes. `sniptide login` calls this before saving a token.",
        security: [{ apiToken: [] }],
        responses: {
          "200": {
            description: "The token is valid.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["user", "scopes"],
                  properties: {
                    user: {
                      type: "object",
                      required: ["id", "name"],
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        username: { type: ["string", "null"] },
                      },
                    },
                    scopes: { $ref: "#/components/schemas/Scopes" },
                  },
                },
                example: {
                  user: { id: "u_8f2k1", name: "Ada", username: "ada" },
                  scopes: ["read", "write"],
                },
              },
            },
          },
          ...tokenErrors,
        },
      },
    },
    "/api/v1/pastes": {
      get: {
        operationId: "listOwnPastes",
        tags: ["Token API"],
        summary: "List and search your pastes",
        description: [
          "The token owner's pastes, most recently edited first, without file contents. Trashed and",
          "expired pastes are left out. Filters combine: every `tag` must be on the paste.",
          "Follow `nextCursor` for the next page; it is `null` on the last one.",
        ].join("\n"),
        security: [{ apiToken: [] }],
        parameters: [
          {
            name: "q",
            in: "query",
            required: false,
            description: "Text in the title or slug.",
            schema: { type: "string", maxLength: 120, examples: ["button"] },
          },
          {
            name: "tag",
            in: "query",
            required: false,
            description: "Repeat for several tags.",
            schema: { type: "array", items: { type: "string" }, examples: [["react"]] },
            explode: true,
          },
          {
            name: "language",
            in: "query",
            required: false,
            description: "A language id any of the paste's files is in.",
            schema: { type: "string", examples: ["typescript"] },
          },
          {
            name: "collection",
            in: "query",
            required: false,
            description: "A collection slug.",
            schema: { type: "string", examples: ["ui"] },
          },
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
          {
            name: "cursor",
            in: "query",
            required: false,
            description: "`nextCursor` from the previous page.",
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "One page of pastes.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["pastes", "nextCursor"],
                  properties: {
                    pastes: {
                      type: "array",
                      items: { $ref: "#/components/schemas/PasteSummary" },
                    },
                    nextCursor: { type: ["string", "null"] },
                  },
                },
                example: { pastes: [pasteExample.summary], nextCursor: null },
              },
            },
          },
          "400": jsonError("A filter or the cursor isn't valid.", "The cursor isn't valid."),
          ...tokenErrors,
        },
      },
      post: {
        operationId: "createPaste",
        tags: ["Token API"],
        summary: "Capture code as a paste",
        description: [
          "Creates a paste from up to 10 files, keeping each file's relative path as its name. The",
          "language is detected from the name. Pastes are private unless `visibility` says",
          "otherwise and never expire. A `collection` must already exist. The account's paste,",
          "storage and hourly create limits apply, as in the editor. `sniptide push` sends this.",
        ].join("\n"),
        security: [{ apiToken: ["write"] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Capture" },
              example: pasteExample.capture,
            },
          },
        },
        responses: {
          "201": {
            description: "The paste, as saved.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["paste"],
                  properties: { paste: { $ref: "#/components/schemas/Paste" } },
                },
                example: { paste: pasteExample.paste },
              },
            },
          },
          "400": jsonError("The capture isn't valid.", "Give the paste a title."),
          "404": jsonError(
            "The collection doesn't exist.",
            "That collection doesn't exist. Create it in Sniptide first.",
          ),
          "413": jsonError(
            "The body, the paste or the account's storage is over its limit.",
            "You've reached your storage limit. Permanently delete some pastes or reduce their size.",
          ),
          ...tokenErrors,
        },
      },
    },
    "/api/v1/pastes/{id}": {
      get: {
        operationId: "getOwnPaste",
        tags: ["Token API"],
        summary: "Read one of your pastes",
        description: "A paste with every file, by its id or slug. `sniptide pull <id>` reads this.",
        security: [{ apiToken: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "The paste's id or its slug.",
            schema: { type: "string", examples: ["k7Qe2x"] },
          },
        ],
        responses: {
          "200": {
            description: "The paste.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["paste"],
                  properties: { paste: { $ref: "#/components/schemas/Paste" } },
                },
                example: { paste: pasteExample.paste },
              },
            },
          },
          "404": jsonError(
            "No paste of yours has that id, or it is trashed or expired.",
            "No paste with that id.",
          ),
          ...tokenErrors,
        },
      },
      put: {
        operationId: "updateOwnPaste",
        tags: ["Token API"],
        summary: "Update one of your pastes",
        description:
          "Replaces title and all files. Omitted metadata is preserved. Explicit null clears collection/source. Link, expiry, password and burn setting stay unchanged. Records an edit in history. Requires write scope.",
        security: [{ apiToken: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CaptureUpdate" },
              example: pasteExample.capture,
            },
          },
        },
        responses: {
          "200": {
            description: "The updated paste.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { paste: { $ref: "#/components/schemas/Paste" } },
                },
                example: { paste: pasteExample.paste },
              },
            },
          },
          "400": jsonError("Invalid input.", "Check the paste fields."),
          "404": jsonError(
            "No live paste of yours has that id, or the collection does not exist.",
            "No paste with that id.",
          ),
          "413": jsonError("Request or storage limit exceeded.", "The request body is too large."),
          ...tokenErrors,
        },
      },
    },
    "/api/v1/collections/{slug}/pastes": {
      get: {
        operationId: "getCollectionPastes",
        tags: ["Token API"],
        summary: "Read a collection's pastes",
        description: [
          "Every live paste in one of your collections with its files, oldest first, 50 a page.",
          "The order is stable across pages. `sniptide pull collection:<slug>` reads all pages",
          "before writing anything.",
        ].join("\n"),
        security: [{ apiToken: [] }],
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            description: "The collection's slug, as in its URL.",
            schema: { type: "string", examples: ["ui"] },
          },
          {
            name: "cursor",
            in: "query",
            required: false,
            description: "`nextCursor` from the previous page.",
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "One page of pastes.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["pastes", "nextCursor"],
                  properties: {
                    pastes: { type: "array", items: { $ref: "#/components/schemas/Paste" } },
                    nextCursor: { type: ["string", "null"] },
                  },
                },
                example: { pastes: [pasteExample.paste], nextCursor: null },
              },
            },
          },
          "400": jsonError("The cursor isn't valid.", "The cursor isn't valid."),
          "404": jsonError("You have no collection by that slug.", "No collection with that name."),
          ...tokenErrors,
        },
      },
    },
    "/api/v1/env": {
      get: {
        operationId: "listEnvGroups",
        tags: ["Env"],
        summary: "List your env groups",
        description: "Each group's name and how many variables it holds. No values.",
        security: [{ apiToken: [] }],
        responses: {
          "200": {
            description: "Your env groups, most recently pushed first.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["groups"],
                  properties: {
                    groups: {
                      type: "array",
                      items: {
                        type: "object",
                        required: ["slug", "variables", "createdAt", "updatedAt"],
                        properties: {
                          slug: { type: "string" },
                          variables: { type: "integer" },
                          createdAt: { type: "string", format: "date-time" },
                          updatedAt: { type: "string", format: "date-time" },
                        },
                      },
                    },
                  },
                },
                example: {
                  groups: [
                    {
                      slug: "my-app",
                      variables: 2,
                      createdAt: "2026-10-12T09:30:00.000Z",
                      updatedAt: "2026-10-13T08:02:11.000Z",
                    },
                  ],
                },
              },
            },
          },
          ...tokenErrors,
        },
      },
    },
    "/api/v1/env/{group}": {
      get: {
        operationId: "getEnvGroup",
        tags: ["Env"],
        summary: "Read an env group",
        description:
          "The group's variables with their values, in the order they were pushed. `sniptide env pull` and `env run` read this.",
        security: [{ apiToken: [] }],
        parameters: [envGroupParameter],
        responses: {
          "200": {
            description: "The group.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["group"],
                  properties: { group: { $ref: "#/components/schemas/EnvGroup" } },
                },
                example: { group: envExample },
              },
            },
          },
          "404": jsonError("You have no env group by that name.", "No env group with that name."),
          ...tokenErrors,
        },
      },
      put: {
        operationId: "putEnvGroup",
        tags: ["Env"],
        summary: "Replace an env group",
        description: [
          "Sets the group's variables to exactly these, creating the group if it's new: a",
          "variable left out is removed. Values are encrypted before they're stored. Up to 500",
          "variables, 32 KB per value and 256 KB per group. `sniptide env push` sends this.",
        ].join("\n"),
        security: [{ apiToken: ["write"] }],
        parameters: [envGroupParameter],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["variables"],
                properties: {
                  variables: { $ref: "#/components/schemas/EnvVariables" },
                },
              },
              example: { variables: envExample.variables },
            },
          },
        },
        responses: {
          "200": {
            description: "The group, as saved.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["group"],
                  properties: { group: { $ref: "#/components/schemas/EnvGroup" } },
                },
                example: { group: envExample },
              },
            },
          },
          "400": jsonError(
            "A name or value isn't valid, or the group is over its limits.",
            "Each variable can only appear once.",
          ),
          "409": jsonError(
            "The account already has the most env groups it can.",
            "You can have up to 100 env groups. Delete one first.",
          ),
          ...tokenErrors,
        },
      },
      delete: {
        operationId: "deleteEnvGroup",
        tags: ["Env"],
        summary: "Delete an env group",
        description: "Removes the group and all its variables.",
        security: [{ apiToken: ["write"] }],
        parameters: [envGroupParameter],
        responses: {
          "200": {
            description: "Deleted.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Success" },
                example: { ok: true },
              },
            },
          },
          "404": jsonError("You have no env group by that name.", "No env group with that name."),
          ...tokenErrors,
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
      apiToken: {
        type: "http",
        scheme: "bearer",
        description:
          "A personal API token (`snpt_…`) from Settings → API tokens. Shown once when created; revoke it there.",
      },
      metricsToken: {
        type: "http",
        scheme: "bearer",
        description: "The server's `METRICS_TOKEN`, a long random string you choose.",
      },
    },
    schemas: {
      Scopes: {
        type: "array",
        items: { enum: ["read", "write"] },
        description: "What the token may do. Every token can read; write also creates.",
      },
      File: {
        ...jsonSchema(responseFileSchema),
        properties: fileProperties,
      },
      CaptureFile: {
        ...jsonSchema(apiCaptureSchema.shape.files.element),
        properties: fileProperties,
      },
      Source: {
        ...jsonSchema(sourceSchema.nullable()),
        description:
          "The Git repository and commit the code was captured from. The dirty flag marks changes in the working tree.",
      },
      Capture: {
        ...captureInput,
        properties: captureProperties,
      },
      CaptureUpdate: {
        ...captureInput,
        description:
          "Replaces title/files; omitted metadata is preserved. No creation defaults apply.",
        properties: {
          ...captureProperties,
          description: jsonSchema(mcpCaptureSchema.shape.description),
          visibility: jsonSchema(mcpCaptureSchema.shape.visibility),
          collection: jsonSchema(apiCaptureSchema.shape.collection.removeDefault()),
          tags: jsonSchema(apiCaptureSchema.shape.tags.in.removeDefault()),
        },
      },
      PasteSummary: {
        ...jsonSchema(apiPasteSummarySchema),
        properties: {
          ...jsonSchema(apiPasteSummarySchema).properties,
          ...pasteProperties,
        },
      },
      Paste: {
        ...pasteInput,
        properties: {
          ...pasteInput.properties,
          ...pasteProperties,
          files: { type: "array", items: { $ref: "#/components/schemas/File" } },
        },
      },
      EnvGroup: {
        type: "object",
        required: ["slug", "updatedAt", "variables"],
        properties: {
          slug: { type: "string" },
          updatedAt: { type: "string", format: "date-time" },
          variables: { $ref: "#/components/schemas/EnvVariables" },
        },
      },
      EnvVariables: {
        type: "array",
        maxItems: 500,
        description: "In .env file order. Names are unique.",
        items: {
          type: "object",
          required: ["name", "value"],
          properties: {
            name: { type: "string", pattern: "^[A-Za-z_][A-Za-z0-9_]{0,255}$" },
            value: { type: "string", description: "Up to 32 KB." },
          },
        },
      },
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
  "/[slug]/preview",
  "/analytics/export",
  "/api/analytics",
  "/api/analytics/[...path]",
  "/api/auth/[...all]",
  "/api/notifications",
  "/api/notifications/unsubscribe",
  "/demo",
  "/api/locale",
  "/api/search",
  "/api/stats",
  "/secrets/manage",
  "/secret-share/[token]/reveal",
] as const
