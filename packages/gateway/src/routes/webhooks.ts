import { Hono } from 'hono'
import { z } from 'zod'
import { apiKeyAuth } from '../middleware/apiKeyAuth.js'
import { eitherAuth, clerkAuth, type ClerkAuthOptions } from '../middleware/clerkAuth.js'
import { cronAuth } from '../middleware/cronAuth.js'
import { dispatchPendingWebhooks } from '../jobs/webhookDispatcher.js'
import { compactTraces } from '../jobs/traceCompactor.js'
import type { Storage } from '../storage/types.js'

const TestBody = z.object({
  url: z.string().url(),
  payload: z.record(z.unknown()).default({}),
})

export interface WebhookRouteOptions {
  storage: Storage
  resolveSession: ClerkAuthOptions['resolveSession']
  cronSecret: string | null
  fetcher?: typeof fetch
}

export const createWebhookRoutes = ({
  storage,
  resolveSession,
  cronSecret,
  fetcher,
}: WebhookRouteOptions) => {
  const app = new Hono()

  app.post(
    '/v1/webhooks/test',
    eitherAuth(apiKeyAuth({ storage, scopes: ['secret'] }), clerkAuth({ resolveSession })),
    async (c) => {
      const auth = c.get('auth')
      const parsed = TestBody.safeParse(await c.req.json().catch(() => null))
      if (!parsed.success) {
        return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)
      }
      const delivery = await storage.webhooks.schedule({
        orgId: auth.orgId,
        url: parsed.data.url,
        payload: parsed.data.payload,
        scheduledAt: new Date().toISOString(),
      })
      return c.json({ ok: true, deliveryId: delivery.id }, 202)
    }
  )

  app.get(
    '/v1/webhooks',
    eitherAuth(apiKeyAuth({ storage, scopes: ['secret'] }), clerkAuth({ resolveSession })),
    async (c) => {
      const auth = c.get('auth')
      const deliveries = await storage.webhooks.list(auth.orgId)
      return c.json({ deliveries })
    }
  )

  app.post('/v1/cron/webhooks', cronAuth({ secret: cronSecret }), async (c) => {
    const dispatcherOptions: Parameters<typeof dispatchPendingWebhooks>[0] = { storage }
    if (fetcher) dispatcherOptions.fetcher = fetcher
    const result = await dispatchPendingWebhooks(dispatcherOptions)
    return c.json(result)
  })

  app.post('/v1/cron/compact-traces', cronAuth({ secret: cronSecret }), async (c) => {
    const result = await compactTraces({ storage })
    return c.json(result)
  })

  return app
}
