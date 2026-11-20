import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { once } from "node:events"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { promisify } from "node:util"

test("a paste counts only when a separate reader receives the full submitted file", async () => {
  const stored = new Map()
  const anonymousReads = new Set()
  const server = createServer(async (req, res) => {
    if (req.method === "POST") {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      stored.set(req.url, Buffer.concat(chunks).toString())
      res.writeHead(200).end()
    } else if (req.url.startsWith("/paste/")) {
      if (req.headers.cookie?.includes("writer=")) {
        res.writeHead(200, { "Content-Type": "text/plain" }).end("Saved")
        return
      }
      anonymousReads.add(req.url.slice(6))
      res.setHeader("Content-Type", "text/html")
      const text = stored.get(req.url.slice(6))
      res.end(`<pre>${req.url.endsWith("broken") ? text.slice(1) : text}</pre>`)
    } else if (["/good", "/broken"].includes(req.url)) {
      res.setHeader("Set-Cookie", "writer=yes; Path=/")
      res.setHeader("Content-Type", "text/html")
      res.end(`<textarea id="message"></textarea><button id="sendbutton" onclick="save()">Save</button>
      <script>async function save() {
        await fetch(location.pathname,{method:"POST",body:document.querySelector("textarea").value})
        location.href="/paste/"+location.pathname
      }</script>`)
    } else res.writeHead(404).end()
  })
  const dir = await mkdtemp(join(tmpdir(), "paste-benchmark-test-"))
  try {
    server.listen(0, "127.0.0.1")
    await once(server, "listening")
    const file = join(dir, "instances.json")
    for (const scenario of ["good", "broken"]) {
      await writeFile(
        file,
        JSON.stringify({
          PrivateBin: { url: `http://127.0.0.1:${server.address().port}/${scenario}` },
        }),
      )
      const { stdout } = await promisify(execFile)(process.execPath, [
        "scripts/paste-benchmark.mjs",
        "--config",
        file,
        "--rounds",
        "1",
        "--json",
      ])
      const [sample] = JSON.parse(stdout).rows[0].samples
      assert.ok(anonymousReads.has(`/${scenario}`))
      assert.equal(Buffer.byteLength(stored.get(`/${scenario}`)), 1024)
      if (scenario === "good") {
        assert.equal(sample.outcome, "verified")
        assert.ok(sample.totalMs >= sample.createMs)
      } else {
        assert.equal(sample.outcome, "read: timeout")
        assert.equal(sample.totalMs, undefined)
      }
    }
  } finally {
    server.closeAllConnections()
    server.close()
    await rm(dir, { force: true, recursive: true })
  }
})
