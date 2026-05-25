import { auditId } from '../util/ids.js'
import { Hono } from 'hono'
import { PolicyRule } from '@agentronics/protocol'
import { z } from 'zod'
import { apiKeyAuth, ensureSiteOwnership } from '../middleware/apiKeyAuth.js'
import { eitherAuth, clerkAuth, type ClerkAuthOptions } from '../middleware/clerkAuth.js'
import { computeEtag } from '../storage/memory.js'
import type { Storage } from '../storage/types.js'

const Body = z.object({ policies: z.array(PolicyRule) })

export const createPolicyRoutes = ({
  storage,
  resolveSession,
}: {
  storage: Storage
  resolveSession: ClerkAuthOptions['resolveSession']
}) => {
  const app = new Hono()

  app.get(
    '/v1/sites/:siteId/policies',
    apiKeyAuth({ storage, scopes: ['publishable', 'secret'] }),
    async (c) => {
      const siteId = c.req.param('siteId')
      const auth = c.get('auth')
      const ownership = await ensureSiteOwnership(storage, siteId, auth)
      if (!ownership.ok) {
        return c.json({ error: ownership.status === 403 ? 'forbidden' : 'not_found' }, ownership.status)
      }

      const document = await storage.policies.get(siteId)
      const policies = document?.policies ?? []
      const etag = document?.etag ?? computeEtag(policies)

      const ifNoneMatch = c.req.header('if-none-match')
      if (ifNoneMatch && ifNoneMatch === etag) {
        c.header('etag', etag)
        c.header('cache-control', 'public, max-age=60')
        return c.body(null, 304)
      }
      c.header('etag', etag)
      c.header('cache-control', 'public, max-age=60')
      return c.json({ policies })
    }
  )

  app.put(
    '/v1/sites/:siteId/policies',
    eitherAuth(apiKeyAuth({ storage, scopes: ['secret'] }), clerkAuth({ resolveSession })),
    async (c) => {
      const siteId = c.req.param('siteId')
      const auth = c.get('auth')
      const ownership = await ensureSiteOwnership(storage, siteId, auth)
      if (!ownership.ok) {
        return c.json({ error: ownership.status === 403 ? 'forbidden' : 'not_found' }, ownership.status)
      }

      const parsed = Body.safeParse(await c.req.json())
      if (!parsed.success) {
        return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)
      }
      const etag = computeEtag(parsed.data.policies)
      await storage.policies.put(siteId, {
        policies: parsed.data.policies,
        etag,
        updatedAt: new Date().toISOString(),
      })
      await storage.audit.insert({
        id: auditId(),
        orgId: auth.orgId,
        actor: auth.apiKeyId,
        action: 'policies.put',
        target: siteId,
        metadata: { count: parsed.data.policies.length },
        occurredAt: new Date().toISOString(),
      })
      c.header('etag', etag)
      return c.json({ ok: true, etag })
    }
  )

  return app
}
