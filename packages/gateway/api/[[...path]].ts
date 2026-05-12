// Vercel serverless entry. Wraps the same Hono `createApp()` used by the
// long-running Node server (`src/server.ts`) and the Dockerfile, so the
// route handlers are identical across runtimes. The `vercel.json` rewrite
// at the gateway project root maps `/(.*)` -> `/api/$1`, which lands every
// public URL on this catchall function. We then mount the inner Hono app
// under `/api` so its native `/v1/*` routes resolve once Vercel strips the
// rewrite prefix.

import { Hono } from 'hono'
import { handle } from 'hono/vercel'
import { createApp } from '../src/app.js'
import { loadEnv } from '../src/env.js'
import { createInMemoryStorage } from '../src/storage/memory.js'
import { seedFixture, DEMO_FIXTURE } from '../src/storage/seed.js'
import type { ClerkAuthOptions } from '../src/middleware/clerkAuth.js'

export const config = { runtime: 'nodejs' }

const env = loadEnv()
const storage = createInMemoryStorage()

let resolveSession: ClerkAuthOptions['resolveSession'] | undefined
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
