export function versionParts(version) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version))
    throw new Error(`Invalid stable version: ${version}`)
  const parts = version.split(".").map(Number)
  if (!parts.every(Number.isSafeInteger)) throw new Error("Version exceeds integer precision")
  return parts
}

export async function responseJson(url, request) {
  const response = await request(url, { signal: AbortSignal.timeout(30_000) })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Registry lookup failed: HTTP ${response.status}`)
  return response.json()
}
export async function publicPackage(name, request = fetch) {
  const document = await responseJson(
    `https://registry.npmjs.org/${encodeURIComponent(name)}`,
    request,
  )
  if (!document) return { current: null, versions: [] }
  if (document.name !== name || !document.versions) throw new Error("Invalid package document")
  const versions = Object.keys(document.versions)
    .filter((version) => /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version))
    .sort((a, b) => {
      const x = versionParts(a),
        y = versionParts(b)
      return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]
    })
  return { current: versions.length ? document.versions[versions.at(-1)] : null, versions }
}
