const url = "http://127.0.0.1:3000/api/health"

async function healthy(request = fetch) {
  try {
    const response = await request(url, { signal: AbortSignal.timeout(4000) })
    return response.ok
  } catch {
    return false
  }
}

if (require.main === module)
  healthy().then((ok) => {
    process.exitCode = ok ? 0 : 1
  })
module.exports = { healthy }
