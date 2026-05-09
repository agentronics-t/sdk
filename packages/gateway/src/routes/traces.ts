import { Hono } from 'hono'
import { AgentClass, TraceBatch, type TraceEvent } from '@agentronics/protocol'
import { apiKeyAuth } from '../middleware/apiKeyAuth.js'
import { eitherAuth, clerkAuth, type ClerkAuthOptions } from '../middleware/clerkAuth.js'
import { enforceQuota } from '../auth/quota.js'
import type { Storage, TraceQueryOptions } from '../storage/types.js'

export const createTraceRoutes = ({
  storage,
  resolveSession,
}: {
  storage: Storage
  resolveSession: ClerkAuthOptions['resolveSession']
}) => {
  const app = new Hono()

  app.post(
    '/v1/traces',
    apiKeyAuth({ storage, scopes: ['publishable', 'secret'] }),
    async (c) => {
      const auth = c.get('auth')
      const body = await c.req.json().catch(() => null)
      const parsed = TraceBatch.safeParse(body)
      if (!parsed.success) {
        return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)
      }

      // Tenant integrity: every trace's `siteId` must belong to the org that
      // owns the API key. Stops a (compromised or misconfigured) publishable
      // key from injecting traces that map to a foreign org's site name.
      const ownedSites = new Set(
        (await storage.sites.listForOrg(auth.orgId)).map((site) => site.id)
      )
      const foreign = parsed.data.events.find((event) => !ownedSites.has(event.siteId))
      if (foreign) {
        return c.json(
          {
            error: 'site_not_owned',
            siteId: foreign.siteId,
            hint: 'The siteId in this trace is not registered to the org that owns this API key. Create the site in the dashboard first.',
          },
          403
        )
      }

      const quota = await enforceQuota(storage.quota, auth.orgId, parsed.data.events)
      if (!quota.ok) {
        return c.json(
          {
            error: 'quota_exceeded',
            count: quota.count,
            limit: quota.limit,
            reason: 'free_tier_monthly_quota',
          },
          429
        )
      }

      const result = await storage.traces.insert(auth.orgId, parsed.data.events)
      return c.json({ ok: true, accepted: result.accepted, quota }, 202)
    }
  )

  app.get(
    '/v1/traces',
    eitherAuth(apiKeyAuth({ storage, scopes: ['secret'] }), clerkAuth({ resolveSession })),
    async (c) => {
      const auth = c.get('auth')
      const query: TraceQueryOptions = {
        limit: clampLimit(c.req.query('limit')),
        cursor: c.req.query('cursor') ?? null,
      }
      const agentClass = c.req.query('agentClass')
      if (agentClass) {
        const parsed = AgentClass.safeParse(agentClass)
        if (!parsed.success) {
          return c.json({ error: 'invalid_query', field: 'agentClass' }, 400)
        }
        query.agentClass = parsed.data
      }
      const type = c.req.query('type')
      if (type) query.type = type as TraceEvent['type']
      const since = c.req.query('since')
      if (since) query.since = since
      const until = c.req.query('until')
      if (until) query.until = until

      const result = await storage.traces.query(auth.orgId, query)
      return c.json(result)
    }
  )

  return app
}

const clampLimit = (raw: string | undefined): number => {
  if (!raw) return 50
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return 50
  return Math.min(value, 200)
}
