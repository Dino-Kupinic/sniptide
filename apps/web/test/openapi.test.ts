import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { internalRoutes, openApiDocument } from "@/lib/openapi"

// Keeps the API reference honest: every route handler is documented or listed as internal, every
// documented operation has a handler, and each entry carries what a reader needs.

const appDir = path.join(import.meta.dir, "../app")
interface Parameter {
  name: string
  in: string
}
const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]

// The URL path of a route.ts file: route groups drop out and [slug] becomes {slug}.
function urlPath(file: string) {
  const segments = path
    .dirname(path.relative(appDir, file))
    .split(path.sep)
    .filter((segment) => segment !== "." && !/^\(.*\)$/.test(segment))
  return `/${segments.join("/")}`
}

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return routeFiles(full)
    return entry.name === "route.ts" ? [full] : []
  })
}

// "METHOD /path" for every exported handler, with the document's {param} spelling.
const handlers = routeFiles(appDir).flatMap((file) => {
  const source = readFileSync(file, "utf8")
  const route = urlPath(file)
  // `export function GET`, `export const GET` and `export { handle as GET }`.
  return METHODS.filter(
    (method) =>
      new RegExp(`export\\s+(async\\s+)?(function|const)\\s+${method}\\b`).test(source) ||
      new RegExp(`export\\s*\\{[^}]*\\bas\\s+${method}\\b`).test(source),
  ).map((method) => ({ method, route, documented: route.replace(/\[([^\].]+)\]/g, "{$1}") }))
})

const operations = Object.entries(openApiDocument.paths).flatMap(([route, item]) =>
  Object.entries(item).map(([method, operation]) => ({
    route,
    method: method.toUpperCase(),
    operation: operation as {
      operationId?: string
      summary?: string
      responses: Record<string, { description?: string; content?: Record<string, unknown> }>
    },
  })),
)

describe("API reference", () => {
  test("finds the route handlers", () => {
    expect(handlers.length).toBeGreaterThan(5)
  })

  test("distinguishes creation defaults, metadata-preserving updates and detected file languages", () => {
    const schemas = openApiDocument.components.schemas
    expect(schemas.Capture.required).toEqual(["title", "files"])
    expect(schemas.CaptureUpdate.required).toEqual(["title", "files"])
    expect(schemas.Capture.properties).toHaveProperty("visibility.default", "private")
    for (const field of Object.values(schemas.CaptureUpdate.properties))
      expect(field).not.toHaveProperty("default")
    expect(schemas.File.required).toEqual(["name", "language", "content"])
    expect(schemas.CaptureFile.required).toEqual(["name", "content"])
  })

  test("documents every route handler that isn't internal", () => {
    const missing = handlers
      .filter(({ route }) => !(internalRoutes as readonly string[]).includes(route))
      .filter(
        ({ method, documented }) =>
          !operations.some((entry) => entry.route === documented && entry.method === method),
      )
      .map(({ method, route }) => `${method} ${route}`)
    expect(missing).toEqual([])
  })

  test("documents no route that doesn't exist", () => {
    const stale = operations
      .filter(
        ({ method, route }) =>
          !handlers.some((handler) => handler.documented === route && handler.method === method),
      )
      .map(({ method, route }) => `${method} ${route}`)
    expect(stale).toEqual([])
  })

  test("doesn't list a route as internal that has no handler", () => {
    const known = new Set(handlers.map(({ route }) => route))
    expect(internalRoutes.filter((route) => !known.has(route))).toEqual([])
  })

  test("doesn't document an internal route", () => {
    const documented = new Set(operations.map(({ route }) => route))
    expect(internalRoutes.filter((route) => documented.has(route))).toEqual([])
  })

  test("gives every operation a unique id, a summary and described responses", () => {
    const ids = operations.map(({ operation }) => operation.operationId)
    expect(ids.every(Boolean)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
    for (const { operation, route, method } of operations) {
      expect(operation.summary, `${method} ${route} summary`).toBeTruthy()
      expect(Object.keys(operation.responses), `${method} ${route} responses`).not.toHaveLength(0)
      for (const [status, response] of Object.entries(operation.responses))
        expect(response.description ?? "x", `${method} ${route} ${status}`).toBeTruthy()
    }
  })

  test("shows an example for every response that has a body", () => {
    for (const { operation, route, method } of operations)
      for (const [status, response] of Object.entries(operation.responses))
        for (const [type, media] of Object.entries(response.content ?? {}))
          expect(
            (media as { example?: unknown }).example,
            `${method} ${route} ${status} ${type}`,
          ).toBeDefined()
  })

  test("declares a parameter for every path variable", () => {
    for (const [route, item] of Object.entries(openApiDocument.paths)) {
      const variables = [...route.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? "")
      for (const operation of Object.values(item) as { parameters?: Parameter[] }[]) {
        const declared = (operation.parameters ?? [])
          .filter((parameter) => parameter.in === "path")
          .map((parameter) => parameter.name)
        expect(declared.sort(), route).toEqual(variables.sort())
      }
    }
  })

  test("token operation scopes match the route handlers", () => {
    for (const { route, method, operation } of operations.filter(
      ({ route }) => route === "/api/mcp" || route.startsWith("/api/v1/"),
    )) {
      const file = path.join(appDir, route.replace(/\{(\w+)\}/g, "[$1]"), "route.ts")
      const source = readFileSync(file, "utf8")
      const body = source.match(
        new RegExp(`export async function ${method}\\b[\\s\\S]*?(?=export async function|$)`),
      )?.[0]
      expect(body, `${method} ${route}`).toBeDefined()
      const direct = body?.match(/withToken\(\s*request,\s*"(read|write)"/)
      const scope =
        direct?.[1] ??
        (route === "/api/mcp" && method === "DELETE" && /return GET\(request\)/.test(body ?? "")
          ? source
              .match(/export async function GET\b[\s\S]*?(?=export async function|$)/)?.[0]
              .match(/withToken\(\s*request,\s*"(read|write)"/)?.[1]
          : undefined)
      if (!scope) throw new Error(`Missing token scope for ${method} ${route}`)
      expect((operation as { "x-required-scopes"?: string[] })["x-required-scopes"]).toEqual([
        scope,
      ])
      expect((operation as { security?: unknown }).security).toEqual([
        { apiToken: [] },
        { oauth: [scope] },
      ])
    }
  })

  test("only references schemas and security schemes that exist", () => {
    const text = JSON.stringify(openApiDocument)
    for (const [, name] of text.matchAll(/#\/components\/schemas\/(\w+)/g))
      expect(Object.keys(openApiDocument.components.schemas)).toContain(name ?? "")
    for (const operation of operations.map((entry) => entry.operation)) {
      const security = (operation as { security?: Record<string, unknown>[] }).security ?? []
      for (const requirement of security)
        for (const scheme of Object.keys(requirement))
          expect(Object.keys(openApiDocument.components.securitySchemes)).toContain(scheme)
    }
  })
})
