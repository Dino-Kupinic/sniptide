import assert from "node:assert/strict"
import { test } from "node:test"
import {
  composeBody,
  hasNotes,
  parseNote,
  pullNumbers,
  technicalBody,
  userPrompt,
} from "./release-notes.mjs"

const commitList = `## [0.77.0](https://github.com/Dino-Kupinic/sniptide/compare/v0.76.0...v0.77.0) (2026-11-08)

### Features

* **web:** move custom links under the handle (WRK-531) ([#251](https://github.com/Dino-Kupinic/sniptide/issues/251)) ([7e7d25f](https://github.com/Dino-Kupinic/sniptide/commit/7e7d25f))`

test("a feature post goes above the collapsed commit list", () => {
  const body = composeBody(
    {
      kind: "feature",
      title: "Custom links now live under your handle",
      body: "Links read `/@you/name`.",
    },
    commitList,
  )
  assert.ok(
    body.startsWith(
      '<!-- sniptide-notes:start kind="feature" -->\n## Custom links now live under your handle\n\nLinks read `/@you/name`.\n<!-- sniptide-notes:end -->',
    ),
  )
  assert.ok(body.includes(`<summary>Technical changes</summary>\n\n${commitList}\n</details>`))
  assert.equal(hasNotes(body), true)
})

test("an internal note is one sentence without a heading", () => {
  const body = composeBody({ kind: "internal", title: "Faster CI runs.", body: "" }, commitList)
  assert.ok(
    body.startsWith(
      '<!-- sniptide-notes:start kind="internal" -->\nFaster CI runs.\n<!-- sniptide-notes:end -->',
    ),
  )
})

test("a rerun recovers the original commit list instead of nesting posts", () => {
  const once = composeBody({ kind: "fix", title: "A", body: "B" }, commitList)
  assert.equal(technicalBody(once), commitList)
  const twice = composeBody({ kind: "fix", title: "C", body: "D" }, technicalBody(once))
  assert.equal(technicalBody(twice), commitList)
  assert.equal(technicalBody(commitList), commitList)
})

test("pull request numbers come from issue and pull links", () => {
  assert.deepEqual(pullNumbers(`${commitList}\n https://github.com/o/r/pull/12`), [251, 12])
})

test("Claude's answer is validated and cleaned", () => {
  const note = parseNote(
    '```json\n{"kind":"fix","title":"## Links work again","body":"Links open — even old ones.<script>x</script>"}\n```',
  )
  assert.deepEqual(note, {
    kind: "fix",
    title: "Links work again",
    body: "Links open, even old ones.x",
  })
  assert.throws(() => parseNote('{"kind":"news","title":"x","body":""}'))
  assert.throws(() => parseNote('{"kind":"fix","title":"","body":""}'))
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
