import assert from "node:assert/strict"
import { test } from "node:test"
import {
  composeBody,
  composePost,
  hasNotes,
  markFeatured,
  parseNote,
  pickProvider,
  pullNumbers,
  technicalBody,
  userPrompt,
  wasFeatured,
} from "./release-notes.mjs"

const commitList = `## [0.77.0](https://github.com/Dino-Kupinic/sniptide/compare/v0.76.0...v0.77.0) (2026-11-08)

### Features

* **web:** move custom links under the handle (WRK-531) ([#251](https://github.com/Dino-Kupinic/sniptide/issues/251)) ([7e7d25f](https://github.com/Dino-Kupinic/sniptide/commit/7e7d25f))`

const feature = {
  kind: "feature",
  title: "Custom links under your handle",
  summary: "Links you create read `/@you/name`, so two people can use the same name.",
  changes: ["Old links redirect to the new address."],
  selfHosting: ["Set `PUBLIC_URL` before you upgrade."],
}

test("a feature post follows the template above the collapsed commit list", () => {
  const body = composeBody(feature, commitList)
  assert.ok(
    body.startsWith(`<!-- sniptide-notes:start kind="feature" -->
## Custom links under your handle

Links you create read \`/@you/name\`, so two people can use the same name.

### What's new

- Old links redirect to the new address.

### Self-hosting

- Set \`PUBLIC_URL\` before you upgrade.
<!-- sniptide-notes:end -->`),
  )
  assert.ok(body.includes(`<summary>Technical changes</summary>\n\n${commitList}\n</details>`))
  assert.equal(hasNotes(body), true)
})

test("empty sections are left out and fixes get their own heading", () => {
  assert.equal(
    composePost({ ...feature, kind: "fix", changes: [], selfHosting: [] }),
    "## Custom links under your handle\n\nLinks you create read `/@you/name`, so two people can use the same name.",
  )
  assert.match(
    composePost({ ...feature, kind: "fix", selfHosting: [] }),
    /### What's fixed\n\n- Old/,
  )
})

test("an internal note is one sentence without a heading", () => {
  const body = composeBody(
    { kind: "internal", title: "Faster CI runs.", summary: "", changes: [], selfHosting: [] },
    commitList,
  )
  assert.ok(
    body.startsWith(
      '<!-- sniptide-notes:start kind="internal" -->\nFaster CI runs.\n<!-- sniptide-notes:end -->',
    ),
  )
})

test("only a feature can be featured, and a rerun keeps the flag", () => {
  const featured = composeBody(feature, commitList, { featured: true })
  assert.ok(featured.startsWith('<!-- sniptide-notes:start kind="feature" featured="true" -->'))
  assert.equal(wasFeatured(featured), true)
  assert.equal(wasFeatured(composeBody(feature, commitList)), false)
  const fix = composeBody({ ...feature, kind: "fix" }, commitList, { featured: true })
  assert.equal(wasFeatured(fix), false)
})

test("an existing feature post can be featured without rewriting it", () => {
  const plain = composeBody(feature, commitList)
  const marked = markFeatured(plain)
  assert.ok(marked.startsWith('<!-- sniptide-notes:start kind="feature" featured="true" -->'))
  assert.equal(marked.replace(' featured="true"', ""), plain)
  assert.equal(markFeatured(marked), marked)
  const fix = composeBody({ ...feature, kind: "fix" }, commitList)
  assert.equal(markFeatured(fix), fix)
})

test("a rerun recovers the original commit list instead of nesting posts", () => {
  const once = composeBody({ ...feature, kind: "fix", title: "A" }, commitList)
  assert.equal(technicalBody(once), commitList)
  const twice = composeBody({ ...feature, kind: "fix", title: "C" }, technicalBody(once))
  assert.equal(technicalBody(twice), commitList)
  assert.equal(technicalBody(commitList), commitList)
})

test("pull request numbers come from issue and pull links", () => {
  assert.deepEqual(pullNumbers(`${commitList}\n https://github.com/o/r/pull/12`), [251, 12])
})

test("the model's answer is validated and cleaned", () => {
  const note = parseNote(
    '```json\n{"kind":"fix","title":"## Links open again.","summary":"Links open — even old ones.<script>x</script>","changes":["- Old links work."],"selfHosting":[]}\n```',
  )
  assert.deepEqual(note, {
    kind: "fix",
    title: "Links open again",
    summary: "Links open, even old ones.x",
    changes: ["Old links work."],
    selfHosting: [],
  })
  const internal = parseNote(
    '{"kind":"internal","title":"Faster CI runs.","summary":"x","changes":["y"],"selfHosting":["z"]}',
  )
  assert.deepEqual(internal, {
    kind: "internal",
    title: "Faster CI runs.",
    summary: "",
    changes: [],
    selfHosting: [],
  })
  const base = { summary: "s", changes: [], selfHosting: [] }
  assert.throws(() => parseNote(JSON.stringify({ ...base, kind: "news", title: "x" })))
  assert.throws(() => parseNote(JSON.stringify({ ...base, kind: "fix", title: "" })))
  assert.throws(() => parseNote(JSON.stringify({ ...base, kind: "fix", title: "x", summary: "" })))
  assert.throws(() =>
    parseNote(JSON.stringify({ ...base, kind: "feature", title: "x".repeat(71) })),
  )
  assert.throws(() => parseNote("no json"))
})

test("the prompt carries the release and each pull request", () => {
  const prompt = userPrompt({ tag_name: "v0.77.0", body: commitList }, [
    { title: "feat(web): move links", body: "Moves links.", labels: ["web"], files: ["apps/web"] },
  ])
  assert.match(prompt, /Release v0\.77\.0/)
  assert.match(
    prompt,
    /### Pull request: feat\(web\): move links\nLabels: web\nChanged paths: apps\/web\n\nMoves links\./,
  )
})

test("Anthropic wins when both keys are set, and the model can be overridden", () => {
  assert.equal(pickProvider({}), null)
  assert.deepEqual(pickProvider({ OPENAI_API_KEY: "o" }), {
    provider: "openai",
    apiKey: "o",
    model: "gpt-6-luna",
  })
  assert.equal(pickProvider({ ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o" }).provider, "anthropic")
  assert.equal(
    pickProvider({ OPENAI_API_KEY: "o", RELEASE_NOTES_MODEL: "gpt-6-luna-fast" }).model,
    "gpt-6-luna-fast",
  )
})
