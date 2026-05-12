// Vercel serverless entry. Plain .js so Vercel's @vercel/node builder
// bundles via esbuild without running tsc on the gateway's TS sources --
// tsup (esbuild) is the gateway's only type stripper today, and pulling
// real tsc into the deploy path would surface unrelated strictness issues
// that have nothing to do with serving requests.
//
// vercel.json rewrites /(.*) -> /api/$1, so every public URL lands on
// this catchall. The inner Hono app is mounted under /api so its native
// /v1/* routes resolve once the rewrite prefix is stripped.

import { Hono } from 'hono'
import { handle } from 'hono/vercel'
import { createApp } from '../src/app.js'
import { loadEnv } from '../src/env.js'
import { createInMemoryStorage } from '../src/storage/memory.js'
import { seedFixture, DEMO_FIXTURE } from '../src/storage/seed.js'

export const config = { runtime: 'nodejs' }

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

const inner = createApp({
  env,
  storage,
  ...(resolveSession ? { resolveSession } : {}),
})

const outer = new Hono()
outer.route('/api', inner)

const handler = handle(outer)
export const GET = handler
export const POST = handler
export const PUT = handler
export const DELETE = handler
export const PATCH = handler
export const OPTIONS = handler
export const HEAD = handler
