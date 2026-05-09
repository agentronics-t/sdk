import { Hono } from 'hono'
import { apiKeyAuth } from '../middleware/apiKeyAuth.js'
import { eitherAuth, clerkAuth, type ClerkAuthOptions } from '../middleware/clerkAuth.js'
import { currentPeriod } from '../auth/quota.js'
import type { Storage } from '../storage/types.js'

export const createMetricsRoutes = ({
  storage,
  resolveSession,
}: {
  storage: Storage
  resolveSession: ClerkAuthOptions['resolveSession']
}) => {
  const app = new Hono()

  app.get(
    '/v1/metrics',
    eitherAuth(apiKeyAuth({ storage, scopes: ['secret'] }), clerkAuth({ resolveSession })),
    async (c) => {
      const auth = c.get('auth')
      const since = c.req.query('since')
      const queryOptions: { since?: string } = {}
      if (since) queryOptions.since = since
      const rows = await storage.aggregates.query(auth.orgId, queryOptions)

      const totals: Record<string, number> = {}
      let total = 0
      for (const row of rows) {
        totals[row.type] = (totals[row.type] ?? 0) + row.count
        total += row.count
      }

      const period = currentPeriod()
      const quota = (await storage.quota.get(auth.orgId, period)) ?? {
        orgId: auth.orgId,
        period,
        count: 0,
        limit: 1000,
      }

      return c.json({
        period,
        total,
        byType: totals,
        rows,
        quota: { count: quota.count, limit: quota.limit, remaining: Math.max(0, quota.limit - quota.count) },
      })
    }
  )

  return app
}
