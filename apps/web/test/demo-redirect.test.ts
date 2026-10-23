import { expect, test } from "bun:test"

test("demo redirects stay on the app origin after browser URL parsing", async () => {
  const paths = [
    "/\\attacker.example",
    "//attacker.example",
    "/\t/attacker.example",
    "/\n/attacker.example",
    "https://attacker.example",
    "/a/..//attacker.example",
    "/%2e%2e//attacker.example",
    "/pastes/example?tab=code#L2",
    "/dashboard",
  ]
  const child = Bun.spawn(
    [
      process.execPath,
      "-e",
      `import { mock } from "bun:test";
       mock.module("server-only", () => ({}));
       mock.module("@/lib/auth", () => ({ isDemoMode: () => true, getSession: async () => ({ user: { id: "demo" } }) }));
       mock.module("@/lib/demo/session", () => ({ enterDemo: async () => true }));
       const { NextRequest } = await import("next/server");
       const { GET } = await import("./app/demo/route");
       const paths = JSON.parse(process.argv[1]);
       const locations = [];
       for (const path of paths) {
         const url = new URL("http://app.test/demo");
         url.searchParams.set("next", path);
         const response = await GET(new NextRequest(url));
         locations.push({ status: response.status, location: response.headers.get("location") });
       }
       console.log(JSON.stringify(locations));`,
      JSON.stringify(paths),
    ],
    { cwd: `${import.meta.dir}/..`, stdout: "pipe", stderr: "pipe" },
  )
  const output = await new Response(child.stdout).text()
  const errors = await new Response(child.stderr).text()
  expect(await child.exited, errors).toBe(0)
  const results: { status: number; location: string }[] = JSON.parse(output)
  for (const result of results) {
    expect(result.status).toBe(303)
    expect(new URL(result.location, "https://public-app.test").origin).toBe(
      "https://public-app.test",
    )
  }
  expect(results.slice(0, 5).map((result) => result.location)).toEqual(
    Array(5).fill("/dashboard"),
  )
  expect(results[7]?.location).toBe("/pastes/example?tab=code#L2")
})
