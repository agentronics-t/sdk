// Bridge from Vercel's Node-style (req, res) handler to Hono's Web fetch
// API. Used by scripts/build-vercel.mjs as the bundled function entry. The
// Build Output API config routes every URL to this function with the
// original pathname preserved in `x-matched-path`.

import { Buffer } from 'node:buffer'
import { createApp } from './app.js'
import { loadEnv } from './env.js'
import { createInMemoryStorage } from './storage/memory.js'
import { seedFixture, DEMO_FIXTURE } from './storage/seed.js'

const env = loadEnv()
const storage = createInMemoryStorage()

let resolveSession
if (env.SEED_FIXTURE) {
  await seedFixture(storage, DEMO_FIXTURE)
  resolveSession = async (headers) => {
    const userId = headers.get('x-clerk-user')
    if (!userId) return null
    return { userId, orgId: DEMO_FIXTURE.orgId }
  }
}

const app = createApp({
  env,
  storage,
  ...(resolveSession ? { resolveSession } : {}),
})

export default async function handler(req, res) {
  const proto = req.headers['x-forwarded-proto'] === 'http' ? 'http' : 'https'
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost'

  // After our Build Output route rewrites every URL to /_gateway, req.url
  // is /_gateway and the original pathname survives in x-matched-path
  // (Vercel sets it before applying the dest rewrite). Fall back to the
  // x-vercel-* mirrors and finally req.url so dev-mode requests still work.
  const originalPath =
    req.headers['x-matched-path'] ||
    req.headers['x-vercel-original-path'] ||
    req.headers['x-original-url'] ||
    req.url

  const url = `${proto}://${host}${originalPath}`

  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') {
      headers.set(k, v)
    } else if (Array.isArray(v)) {
      v.forEach((val) => headers.append(k, val))
    }
  }

  let body
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    body = Buffer.concat(chunks)
  }

  const webReq = new Request(url, {
    method: req.method,
    headers,
    body,
  })

  const webRes = await app.fetch(webReq)

  res.statusCode = webRes.status
  webRes.headers.forEach((v, k) => res.setHeader(k, v))
  const buf = Buffer.from(await webRes.arrayBuffer())
  res.end(buf)
}
