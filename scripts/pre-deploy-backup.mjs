import { spawn } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const targetPattern = /^[a-z_][a-z0-9_-]{0,31}@[A-Za-z0-9.-]+$/
const portPattern = /^[1-9][0-9]{0,4}$/
const uploadedPattern = /^Uploaded (pre-deploy\/[0-9]{8}T[0-9]{6}Z\.[A-Za-z0-9]+\.dump\.age)$/m

/**
 * Builds a function that asks the Docker host for a pre-deploy snapshot over SSH.
 *
 * The host's authorized_keys entry pins the key to one forced command, so the key can't run
 * anything else, and the pinned host key stops the runner from talking to an impostor.
 * Returns undefined when no target is configured.
 */
export function sshPreDeployBackup(env, run = runSsh) {
  const target = env.PRE_DEPLOY_SSH_TARGET
  if (!target && !env.PRE_DEPLOY_SSH_KEY && !env.PRE_DEPLOY_SSH_KNOWN_HOSTS) return undefined
  const port = env.PRE_DEPLOY_SSH_PORT || "22"
  if (
    !targetPattern.test(target ?? "") ||
    !portPattern.test(port) ||
    Number(port) > 65535 ||
    !env.PRE_DEPLOY_SSH_KEY?.includes("PRIVATE KEY") ||
    !env.PRE_DEPLOY_SSH_KNOWN_HOSTS?.trim()
  )
    throw new Error("Invalid pre-deploy backup SSH configuration")
  return async () => {
    const dir = await mkdtemp(join(env.RUNNER_TEMP || tmpdir(), "pre-deploy-"))
    try {
      const key = join(dir, "key")
      const knownHosts = join(dir, "known_hosts")
      await writeFile(key, `${env.PRE_DEPLOY_SSH_KEY.trim()}\n`, { mode: 0o600 })
      await writeFile(knownHosts, `${env.PRE_DEPLOY_SSH_KNOWN_HOSTS.trim()}\n`, { mode: 0o600 })
      const output = await run([
        "-i",
        key,
        "-p",
        port,
        "-o",
        "BatchMode=yes",
        "-o",
        "IdentitiesOnly=yes",
        "-o",
        "StrictHostKeyChecking=yes",
        "-o",
        `UserKnownHostsFile=${knownHosts}`,
        "-o",
        "ConnectTimeout=20",
        target,
        "pre-deploy",
      ])
      const snapshot = output.match(uploadedPattern)?.[1]
      if (!snapshot) throw new Error("Pre-deploy backup did not report an uploaded snapshot")
      return snapshot
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
}

function runSsh(args, timeoutMs = 10 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const child = spawn("ssh", args, { stdio: ["ignore", "pipe", "pipe"] })
    let output = ""
    const collect = (chunk) => {
      process.stderr.write(chunk)
      if (output.length < 65536) output += chunk
    }
    child.stdout.on("data", collect)
    child.stderr.on("data", collect)
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs)
    child.on("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on("close", (code, signal) => {
      clearTimeout(timer)
      if (code === 0) resolve(output)
      else reject(new Error(`Pre-deploy backup failed (${signal ?? `exit ${code}`})`))
    })
  })
}
