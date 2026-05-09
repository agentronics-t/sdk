import { createApp } from '../app.js'
import { issueApiKeyPair } from '../auth/apiKeys.js'
import { loadEnv } from '../env.js'
import { createInMemoryStorage } from '../storage/memory.js'
import type { Storage } from '../storage/types.js'
import type { ClerkAuthOptions } from '../middleware/clerkAuth.js'

export interface FixtureOrg {
  id: string
  siteId: string
  publishable: string
  secret: string
  clerkUserId: string
}

export interface Fixture {
  app: ReturnType<typeof createApp>
  storage: Storage
  orgA: FixtureOrg
  orgB: FixtureOrg
  fetcher: typeof fetch
  cronSecret: string
}

export interface FixtureOptions {
  webhookFetcher?: typeof fetch
  cronSecret?: string
}

const DEFAULT_CRON_SECRET = 'cron-secret-1234567890ab'

const seedOrg = async (
  storage: Storage,
  input: { name: string; siteId: string; clerkUserId: string }
): Promise<FixtureOrg> => {
  const org = await storage.orgs.create({ name: input.name })
  await storage.sites.create({ orgId: org.id, siteId: input.siteId, name: input.siteId })
  const pair = await issueApiKeyPair(storage.apiKeys, { orgId: org.id, label: 'fixture' })
  return {
    id: org.id,
    siteId: input.siteId,
    publishable: pair.publishable.plaintext,
    secret: pair.secret.plaintext,
    clerkUserId: input.clerkUserId,
  }
}

export const buildFixture = async (options: FixtureOptions = {}): Promise<Fixture> => {
  const storage = createInMemoryStorage({
    signatures: [{ id: 'gpt', status: 'stable', version: '1.0.0', signals: { ua: 'GPTBot' } }],
  })
  const orgA = await seedOrg(storage, { name: 'A Inc', siteId: 'site-a', clerkUserId: 'user-a' })
  const orgB = await seedOrg(storage, { name: 'B Inc', siteId: 'site-b', clerkUserId: 'user-b' })
  const cronSecret = options.cronSecret ?? DEFAULT_CRON_SECRET
  const env = loadEnv({
    NODE_ENV: 'test',
    PORT: '8787',
    ALLOWED_ORIGINS: 'http://localhost:3000',
    CRON_SECRET: cronSecret,
  })

  const sessionByUserId = new Map<string, { userId: string; orgId: string }>([
    [orgA.clerkUserId, { userId: orgA.clerkUserId, orgId: orgA.id }],
    [orgB.clerkUserId, { userId: orgB.clerkUserId, orgId: orgB.id }],
  ])
  const resolveSession: ClerkAuthOptions['resolveSession'] = async (headers) => {
    const userId = headers.get('x-clerk-user') ?? null
    if (!userId) return null
    return sessionByUserId.get(userId) ?? null
  }
  const appOptions: Parameters<typeof createApp>[0] = { env, storage, resolveSession }
  if (options.webhookFetcher) appOptions.fetcher = options.webhookFetcher
  const app = createApp(appOptions)
  const fetcher: typeof fetch = async (input, init) => {
    if (input instanceof Request) return app.request(input)
    return app.request(input as string, init as RequestInit)
  }
  return { app, storage, orgA, orgB, fetcher, cronSecret }
}
