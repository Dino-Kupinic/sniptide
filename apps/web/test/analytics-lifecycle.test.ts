import { expect, test } from "bun:test"
import { fileURLToPath } from "node:url"

const setup = `
import assert from "node:assert/strict"
import { mock } from "bun:test"

let excluded = false
let blocked = false
let href = "https://app.test/dashboard?auth=signed_in&method=github"
let sdkLoads = 0
let sdkOnLoad = () => {}
let initCalls = 0
let registerCalls = 0
let failInit = false
let options
const captures = []
let cleanedResolve
const cleaned = new Promise((resolve) => { cleanedResolve = resolve })
globalThis.window = {
  location: {
    get href() { return href },
    get pathname() { return new URL(href).pathname },
  },
  localStorage: {
    getItem() {
      if (blocked) throw new Error("Storage blocked")
      return excluded ? "1" : null
    },
  },
  history: {
    state: null,
    replaceState(state, title, url) {
      href = new URL(url, href).href
      cleanedResolve()
    },
  },
}
mock.module("posthog-js", () => {
  sdkLoads++
  sdkOnLoad()
  return { default: {
    init(key, config) {
      initCalls++
      if (failInit) throw new Error("Initialization failed")
      options = config
    },
    register(properties) {
      registerCalls++
      assert.deepEqual(properties, { surface: "app" })
    },
    capture(event, properties) { captures.push({ event, properties }) },
  } }
})
const config = { key: "phc_test", uiHost: "https://us.posthog.com" }
const analytics = await import("@/lib/analytics")
const watchdog = setTimeout(() => { throw new Error("Analytics did not settle") }, 2000)
`

async function scenario(script: string) {
  const child = Bun.spawn(
    [process.execPath, "--eval", `${setup}\n${script}\nclearTimeout(watchdog)`],
    {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      stdout: "pipe",
      stderr: "pipe",
    },
  )
  const [code, output, errors] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  expect({ code, output, errors }).toEqual({ code: 0, output: "", errors: "" })
}

test("analytics helpers and excluded startup never load the SDK", async () => {
  await scenario(`
assert.equal(sdkLoads, 0)
analytics.scrubUrl("https://app.test/pastes/private?secret=value")
analytics.track("before_start")
assert.equal(sdkLoads, 0)
excluded = true
await analytics.startAnalytics(config)
excluded = false
blocked = true
await analytics.startAnalytics(config)
blocked = false
href = "https://app.test/_site/analytics"
await analytics.startAnalytics(config)
assert.equal(sdkLoads, 0)
assert.equal(initCalls, 0)
assert.equal(captures.length, 0)
`)
})

test("concurrent startup initializes once and captures an auth marker once after readiness", async () => {
  await scenario(`
const first = analytics.startAnalytics(config)
const second = analytics.startAnalytics(config)
analytics.track("during_start")
await Promise.all([first, second])
assert.equal(sdkLoads, 1)
assert.equal(initCalls, 1)
assert.equal(registerCalls, 1)
assert.deepEqual(captures, [])
analytics.consumeAuthMarker()
analytics.consumeAuthMarker()
assert.deepEqual(captures, [{ event: "signed_in", properties: { method: "github" } }])
assert.equal(href, "https://app.test/dashboard")
await analytics.startAnalytics(config)
assert.equal(initCalls, 1)
`)
})

test("startup rechecks exclusion after loading and can retry when included", async () => {
  await scenario(`
sdkOnLoad = () => { excluded = true }
await analytics.startAnalytics(config)
assert.equal(sdkLoads, 1)
assert.equal(initCalls, 0)
excluded = false
await analytics.startAnalytics(config)
assert.equal(initCalls, 1)
`)
})

test("failed initialization clears pending state and allows a later retry", async () => {
  await scenario(`
failInit = true
await assert.rejects(analytics.startAnalytics(config), /Initialization failed/)
analytics.track("after_failure")
assert.deepEqual(captures, [])
failInit = false
await analytics.startAnalytics(config)
analytics.track("after_retry")
assert.equal(initCalls, 2)
assert.equal(registerCalls, 1)
assert.deepEqual(captures, [{ event: "after_retry", properties: undefined }])
`)
})

test("the SDK callback keeps privacy protections and rechecks late exclusion", async () => {
  await scenario(`
await analytics.startAnalytics(config)
assert.equal(options.cookieless_mode, "always")
assert.equal(options.autocapture, false)
assert.equal(options.disable_session_recording, true)
assert.equal(options.disable_surveys, true)
assert.equal(options.mask_all_text, true)
assert.equal(options.mask_all_element_attributes, true)
const event = {
  properties: { $current_url: "https://app.test/pastes/private?content=secret" },
  $set: { pathname: "/pastes/private?content=secret" },
  $set_once: { $initial_referrer: "https://app.test/private?content=secret" },
}
assert.deepEqual(options.before_send(event), {
  properties: { $current_url: "https://app.test/pastes/[slug]" },
  $set: { pathname: "/pastes/[slug]" },
  $set_once: { $initial_referrer: "https://app.test/[slug]" },
})
assert.equal(options.before_send({ properties: { $current_url: "https://app.test/secrets/private" } }), null)
href = "https://app.test/secret-share/token"
assert.equal(options.before_send({ properties: {} }), null)
href = "https://app.test/dashboard"
excluded = true
assert.equal(options.before_send({ properties: {} }), null)
analytics.track("after_exclusion")
assert.deepEqual(captures, [])
`)
})

const componentSetup = `
let effect
mock.module("react", () => ({ useEffect(callback) { effect = callback } }))
const { Analytics } = await import("@/components/analytics")
`

test("the component skips the SDK without enabled runtime configuration", async () => {
  await scenario(`${componentSetup}
globalThis.fetch = async () => new Response(null, { status: 204 })
Analytics()
effect()
await cleaned
assert.equal(sdkLoads, 0)
assert.deepEqual(captures, [])
assert.equal(href, "https://app.test/dashboard")
`)
})

test("the component skips configuration and SDK loading when excluded", async () => {
  await scenario(`${componentSetup}
excluded = true
let configCalls = 0
globalThis.fetch = async () => {
  configCalls++
  return Response.json(config)
}
Analytics()
effect()
await cleaned
assert.equal(configCalls, 0)
assert.equal(sdkLoads, 0)
assert.deepEqual(captures, [])
`)
})

test("exclusion while fetching configuration prevents SDK loading", async () => {
  await scenario(`${componentSetup}
globalThis.fetch = async () => {
  excluded = true
  return Response.json(config)
}
Analytics()
effect()
await cleaned
assert.equal(sdkLoads, 0)
assert.deepEqual(captures, [])
`)
})

test("the component waits for startup before consuming the auth marker", async () => {
  await scenario(`${componentSetup}
globalThis.fetch = async () => Response.json(config)
Analytics()
effect()
await cleaned
assert.equal(initCalls, 1)
assert.deepEqual(captures, [{ event: "signed_in", properties: { method: "github" } }])
`)
})

test("the component clears auth markers when configuration or startup fails", async () => {
  for (const failure of ["fetch", "initialization"]) {
    await scenario(`${componentSetup}
globalThis.fetch = async () => {
  if (${JSON.stringify(failure)} === "fetch") throw new Error("Network failed")
  failInit = true
  return Response.json(config)
}
Analytics()
effect()
await cleaned
assert.deepEqual(captures, [])
assert.equal(href, "https://app.test/dashboard")
`)
  }
})
