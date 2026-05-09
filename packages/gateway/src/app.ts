import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { loadEnv, type Env } from './env.js'
import { pingDatabase } from './db.js'
import { securityHeaders } from './middleware/securityHeaders.js'
import { createRateLimit } from './middleware/rateLimit.js'
import type { ClerkAuthOptions } from './middleware/clerkAuth.js'
import { createPolicyRoutes } from './routes/policies.js'
import { createMemoryRoutes } from './routes/memory.js'
import { createSignatureRoutes } from './routes/signatures.js'
import { createTraceRoutes } from './routes/traces.js'
import { createApiKeyRoutes } from './routes/apiKeys.js'
import { createMetricsRoutes } from './routes/metrics.js'
import { createAuditRoutes } from './routes/audit.js'
import { createWebhookRoutes } from './routes/webhooks.js'
import { createInMemoryStorage } from './storage/memory.js'
import type { Storage } from './storage/types.js'
import { GATEWAY_LANDING_HTML } from './landing.js'

export interface AppOptions {
  env?: Env
  storage?: Storage
  resolveSession?: ClerkAuthOptions['resolveSession']
  fetcher?: typeof fetch
}

const denyAllSessions: ClerkAuthOptions['resolveSession'] = async () => null

export const createApp = ({
  env = loadEnv(),
  storage = createInMemoryStorage(),
  resolveSession = denyAllSessions,
  fetcher,
}: AppOptions = {}) => {
  const app = new Hono()

  app.use('*', logger())
  app.use('*', securityHeaders())
  app.use(
    '/v1/*',
    cors({
      origin: (origin) => (env.ALLOWED_ORIGINS.includes(origin) ? origin : null),
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['content-type', 'authorization', 'if-none-match'],
      exposeHeaders: ['etag'],
      maxAge: 600,
    })
  )
  app.use(
    '/v1/traces',
    createRateLimit({ storage, scope: 'traces', windowSeconds: 60, max: 600 })
  )
  app.use(
    '/v1/api-keys',
    createRateLimit({ storage, scope: 'api-keys', windowSeconds: 60, max: 30 })
  )

  app.get('/', (c) => {
    if ((c.req.header('accept') ?? '').includes('application/json')) {
      return c.json({
        service: 'agentronics-gateway',
        version: '0.1.0',
        endpoints: ['/v1/health', '/v1/policies', '/v1/memory', '/v1/traces', '/v1/metrics', '/v1/api-keys'],
      })
    }
    return c.html(GATEWAY_LANDING_HTML)
  })

  app.get('/v1/health', async (c) => {
    const databaseOk = await pingDatabase(env.DATABASE_URL)
    return c.json({
      status: 'ok',
      version: '0.1.0',
      database: env.DATABASE_URL ? (databaseOk ? 'reachable' : 'unreachable') : 'unconfigured',
      uptimeSeconds: Math.round(process.uptime()),
    })
  })

  app.route('/', createPolicyRoutes({ storage, resolveSession }))
  app.route('/', createMemoryRoutes({ storage, resolveSession }))
  app.route('/', createSignatureRoutes({ storage }))
  app.route('/', createTraceRoutes({ storage, resolveSession }))
  app.route('/', createMetricsRoutes({ storage, resolveSession }))
  app.route('/', createAuditRoutes({ storage, resolveSession }))
  app.route('/', createApiKeyRoutes({ storage, resolveSession }))
  app.route(
    '/',
    createWebhookRoutes({
      storage,
      resolveSession,
      cronSecret: env.CRON_SECRET ?? null,
      ...(fetcher ? { fetcher } : {}),
    })
  )

  app.notFound((c) => c.json({ error: 'not_found', path: c.req.path }, 404))
  app.onError((err, c) => {
    console.error('[gateway]', err)
    return c.json({ error: 'internal_error', message: err.message }, 500)
  })

  return app
}
