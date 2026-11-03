import { expect, test } from "bun:test"

for (const scenario of [
  "hydrate",
  "nav",
  "sidebar",
  "analytics",
  "hourly",
  "settings",
  "list",
  "trash",
]) {
  test(`${scenario} preserves dependencies while overlapping independent reads`, async () => {
    const child = Bun.spawn(
      [process.execPath, "./test/fixtures/hot-path-concurrency.ts", scenario],
      {
        cwd: `${import.meta.dir}/..`,
        stdout: "pipe",
        stderr: "pipe",
      },
    )
    const [output, errors, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    expect(code, errors).toBe(0)
    expect(output.trim()).toBe("ok")
  })
}
