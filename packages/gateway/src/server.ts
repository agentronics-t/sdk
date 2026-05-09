import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { loadEnv } from './env.js'
import { createInMemoryStorage } from './storage/memory.js'
import { seedFixture, DEMO_FIXTURE } from './storage/seed.js'
import type { ClerkAuthOptions } from './middleware/clerkAuth.js'

const env = loadEnv()
const storage = createInMemoryStorage()

let resolveSession: ClerkAuthOptions['resolveSession'] | undefined
if (env.SEED_FIXTURE) {
  await seedFixture(storage, DEMO_FIXTURE)
  console.log(`[gateway] seeded fixture org=${DEMO_FIXTURE.orgId} site=${DEMO_FIXTURE.siteId}`)
  // In fixture mode the dashboard's stub session sends `x-clerk-user: user_demo`.
  // Map any non-empty value to the seeded org so the dashboard sees its data.
  resolveSession = async (headers) => {
    const userId = headers.get('x-clerk-user')
    if (!userId) return null
    return { userId, orgId: DEMO_FIXTURE.orgId }
  }
}

const app = createApp({ env, storage, ...(resolveSession ? { resolveSession } : {}) })

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`[gateway] listening on http://localhost:${info.port}`)
})
