import { readFile } from "node:fs/promises"
import { publishExactArtifact } from "./package-releases.mjs"

if (process.env.GITHUB_ACTIONS !== "true" || !/^[a-f0-9]{40}$/.test(process.env.RELEASE_SHA ?? ""))
  throw new Error("Automatic publication requires the tested GitHub Actions release SHA")
const plan = JSON.parse(await readFile(process.argv[2], "utf8"))
if (plan.artifact.commit !== process.env.RELEASE_SHA)
  throw new Error("Release plan source mismatch")
if (plan.changed) await publishExactArtifact(plan.artifact)
