import assert from "node:assert/strict"
import { existsSync, readFileSync, statSync } from "node:fs"
import test from "node:test"
import { sshPreDeployBackup } from "./pre-deploy-backup.mjs"

const env = {
  PRE_DEPLOY_SSH_TARGET: "sniptide-deploy@deploy.example.com",
  PRE_DEPLOY_SSH_KEY: "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----",
  PRE_DEPLOY_SSH_KNOWN_HOSTS: "deploy.example.com ssh-ed25519 AAAAC3Nza",
}
const uploaded = "Uploaded pre-deploy/20261120T091500Z.Ab12Cd34.dump.age\n"

test("is off when nothing is configured", () => {
  assert.equal(sshPreDeployBackup({}), undefined)
})

test("rejects partial or malformed configuration", () => {
  for (const change of [
    { PRE_DEPLOY_SSH_TARGET: undefined },
    { PRE_DEPLOY_SSH_TARGET: "deploy.example.com" },
    { PRE_DEPLOY_SSH_TARGET: "-oProxyCommand=x@host" },
    { PRE_DEPLOY_SSH_KEY: "" },
    { PRE_DEPLOY_SSH_KNOWN_HOSTS: " " },
    { PRE_DEPLOY_SSH_PORT: "70000" },
    { PRE_DEPLOY_SSH_PORT: "22 -oX" },
  ])
    assert.throws(() => sshPreDeployBackup({ ...env, ...change }), /SSH configuration/)
})

test("pins the host key, uses only the given key and returns the uploaded snapshot", async () => {
  let seen
  const backup = sshPreDeployBackup({ ...env, PRE_DEPLOY_SSH_PORT: "2222" }, async (args) => {
    const option = (name) => args[args.indexOf(name) + 1]
    const knownHosts = args.find((arg) => arg.startsWith("UserKnownHostsFile=")).split("=")[1]
    seen = { args, key: option("-i"), knownHosts }
    assert.equal(statSync(seen.key).mode & 0o777, 0o600)
    assert.match(readFileSync(seen.key, "utf8"), /OPENSSH PRIVATE KEY/)
    assert.equal(readFileSync(knownHosts, "utf8"), `${env.PRE_DEPLOY_SSH_KNOWN_HOSTS}\n`)
    return `Starting\n${uploaded}`
  })
  assert.equal(await backup(), "pre-deploy/20261120T091500Z.Ab12Cd34.dump.age")
  assert.ok(seen.args.includes("StrictHostKeyChecking=yes"))
  assert.ok(seen.args.includes("BatchMode=yes"))
  assert.equal(seen.args[seen.args.indexOf("-p") + 1], "2222")
  assert.deepEqual(seen.args.slice(-2), [env.PRE_DEPLOY_SSH_TARGET, "pre-deploy"])
  assert.equal(existsSync(seen.key), false)
})

test("fails when the host doesn't report an upload", async () => {
  const backup = sshPreDeployBackup(env, async () => "Upload failed for pre-deploy/x.\n")
  await assert.rejects(backup(), /did not report an uploaded snapshot/)
})
