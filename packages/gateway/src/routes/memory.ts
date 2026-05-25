import { auditId } from '../util/ids.js'
import { Hono } from 'hono'
import { SiteMemory } from '@agentronics/protocol'
import { z } from 'zod'
import { apiKeyAuth, ensureSiteOwnership } from '../middleware/apiKeyAuth.js'
import { eitherAuth, clerkAuth, type ClerkAuthOptions } from '../middleware/clerkAuth.js'
import { computeEtag } from '../storage/memory.js'
import type { Storage } from '../storage/types.js'

const Body = z.object({ memory: SiteMemory })

const emptyMemory = (): { memory: ReturnType<typeof SiteMemory.parse>; etag: string } => {
  const memory = SiteMemory.parse({})
  return { memory, etag: computeEtag(memory) }
}

export const createMemoryRoutes = ({
  storage,
  resolveSession,
}: {
  storage: Storage
  resolveSession: ClerkAuthOptions['resolveSession']
}) => {
  const app = new Hono()

  app.get(
    '/v1/sites/:siteId/memory',
    apiKeyAuth({ storage, scopes: ['publishable', 'secret'] }),
    async (c) => {
      const siteId = c.req.param('siteId')
      const auth = c.get('auth')
      const ownership = await ensureSiteOwnership(storage, siteId, auth)
      if (!ownership.ok) {
        return c.json({ error: ownership.status === 403 ? 'forbidden' : 'not_found' }, ownership.status)
      }
      const document = await storage.memory.get(siteId)
      const { memory, etag } = document ? document : emptyMemory()

      const ifNoneMatch = c.req.header('if-none-match')
      if (ifNoneMatch && ifNoneMatch === etag) {
        c.header('etag', etag)
        c.header('cache-control', 'public, max-age=60')
        return c.body(null, 304)
      }
      c.header('etag', etag)
      c.header('cache-control', 'public, max-age=60')
      return c.json({ memory })
    }
  )

  app.put(
    '/v1/sites/:siteId/memory',
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
      const etag = computeEtag(parsed.data.memory)
      await storage.memory.put(siteId, {
        memory: parsed.data.memory,
        etag,
        updatedAt: new Date().toISOString(),
      })
      await storage.audit.insert({
        id: auditId(),
        orgId: auth.orgId,
        actor: auth.apiKeyId,
        action: 'memory.put',
        target: siteId,
        metadata: {},
        occurredAt: new Date().toISOString(),
      })
      c.header('etag', etag)
      return c.json({ ok: true, etag })
    }
  )

  app.get('/v1/sites/:siteId/.well-known/agent-context.json', async (c) => {
    // Public discovery endpoint — intentionally unauthenticated. We only
    // expose a sanitized subset of site memory so operators can put
    // sensitive prompts/policies/page-contexts in memory without leaking
    // them to anyone who guesses the siteId. Anything not listed here is
    // private to authenticated callers via GET /v1/sites/:siteId/memory.
    const siteId = c.req.param('siteId')
    const document = await storage.memory.get(siteId)
    const { memory, etag } = document ? document : emptyMemory()
    const publicMemory = {
      version: memory.version,
      siteMap: memory.siteMap
        ? {
            pages: (memory.siteMap.pages ?? []).map((p) => ({
              path: p.path,
              ...(p.name ? { name: p.name } : {}),
              ...(p.purpose ? { purpose: p.purpose } : {}),
            })),
            ...(memory.siteMap.navigation ? { navigation: memory.siteMap.navigation } : {}),
          }
        : undefined,
      workflows: Object.fromEntries(
        Object.entries(memory.workflows ?? {}).map(([name, wf]) => [
          name,
          { steps: wf.steps },
        ])
      ),
      ...(memory.updatedAt ? { updatedAt: memory.updatedAt } : {}),
    }
    c.header('etag', etag)
    c.header('cache-control', 'public, max-age=300')
    return c.json(publicMemory)
  })

  return app
}
