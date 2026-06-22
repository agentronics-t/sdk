import { auditId } from '../util/ids.js'
import { Hono } from 'hono'
import { ToolRegistry } from '@agentronics/protocol'
import { z } from 'zod'
import { apiKeyAuth, ensureSiteOwnership } from '../middleware/apiKeyAuth.js'
import { eitherAuth, clerkAuth, type ClerkAuthOptions } from '../middleware/clerkAuth.js'
import { computeEtag } from '../storage/memory.js'
import type { Storage } from '../storage/types.js'

const Body = z.object({ registry: ToolRegistry })

const emptyRegistry = (): { tools: ReturnType<typeof ToolRegistry.parse>['tools']; etag: string } => {
  const { tools } = ToolRegistry.parse({})
  return { tools, etag: computeEtag(tools) }
}

/**
 * Tool registry sync — the SDK pushes its surfaced tool descriptors (schemas +
 * per-tool token estimates) so the dashboard can render the page-wise tool
 * view with context-fullness. Mirrors the site-memory routes.
 */
export const createToolRoutes = ({
  storage,
  resolveSession,
}: {
  storage: Storage
  resolveSession: ClerkAuthOptions['resolveSession']
}) => {
  const app = new Hono()

  app.get(
    '/v1/sites/:siteId/tools',
    eitherAuth(apiKeyAuth({ storage, scopes: ['publishable', 'secret'] }), clerkAuth({ resolveSession })),
    async (c) => {
      const siteId = c.req.param('siteId')
      const auth = c.get('auth')
      const ownership = await ensureSiteOwnership(storage, siteId, auth)
      if (!ownership.ok) {
        return c.json({ error: ownership.status === 403 ? 'forbidden' : 'not_found' }, ownership.status)
      }
      const document = await storage.tools.get(siteId)
      const { tools, etag } = document ? document : emptyRegistry()

      const ifNoneMatch = c.req.header('if-none-match')
      if (ifNoneMatch && ifNoneMatch === etag) {
        c.header('etag', etag)
        c.header('cache-control', 'public, max-age=60')
        return c.body(null, 304)
      }
      c.header('etag', etag)
      c.header('cache-control', 'public, max-age=60')
      return c.json({ tools })
    }
  )

  app.put(
    '/v1/sites/:siteId/tools',
    eitherAuth(apiKeyAuth({ storage, scopes: ['publishable', 'secret'] }), clerkAuth({ resolveSession })),
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
      const { tools } = parsed.data.registry
      const etag = computeEtag(tools)
      await storage.tools.put(siteId, {
        tools,
        etag,
        updatedAt: new Date().toISOString(),
      })
      await storage.audit.insert({
        id: auditId(),
        orgId: auth.orgId,
        actor: auth.apiKeyId,
        action: 'tools.put',
        target: siteId,
        metadata: { count: tools.length },
        occurredAt: new Date().toISOString(),
      })
      c.header('etag', etag)
      return c.json({ ok: true, etag, count: tools.length })
    }
  )

  return app
}
