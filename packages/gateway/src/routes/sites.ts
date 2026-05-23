import { Hono } from 'hono'
import { z } from 'zod'
import { clerkAuth, type ClerkAuthOptions } from '../middleware/clerkAuth.js'
import type { Storage } from '../storage/types.js'

const Body = z.object({
  siteId: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-zA-Z0-9._-]+$/, 'siteId may only contain letters, digits, . _ -'),
  name: z.string().min(1).max(120),
})

const auditId = (): string =>
  `aud_${Math.random().toString(36).slice(2, 12)}`

export const createSiteRoutes = ({
  storage,
  resolveSession,
}: {
  storage: Storage
  resolveSession: ClerkAuthOptions['resolveSession']
}) => {
  const app = new Hono()

  app.get('/v1/sites', clerkAuth({ resolveSession }), async (c) => {
    const auth = c.get('auth')
    const sites = await storage.sites.listForOrg(auth.orgId)
    return c.json({ sites })
  })

  app.post('/v1/sites', clerkAuth({ resolveSession }), async (c) => {
    const auth = c.get('auth')
    const parsed = Body.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)
    }
    const existing = await storage.sites.get(parsed.data.siteId)
    if (existing) {
      // Foreign-org collision is the same 409 as own-org collision — we don't
      // want to leak whether a siteId is taken by someone else's org.
      if (existing.orgId !== auth.orgId) {
        return c.json({ error: 'site_id_taken' }, 409)
      }
      return c.json({ site: existing }, 200)
    }
    // First-touch upsert of the Clerk org. Nothing else writes the org row
    // (api-keys.insert has no org-existence check), so without this the very
    // first POST /v1/sites against a real Clerk org throws "Unknown org".
    await storage.orgs.upsert({ id: auth.orgId, name: auth.orgId })
    const site = await storage.sites.create({
      orgId: auth.orgId,
      siteId: parsed.data.siteId,
      name: parsed.data.name,
    })
    await storage.audit.insert({
      id: auditId(),
      orgId: auth.orgId,
      actor: auth.apiKeyId,
      action: 'sites.create',
      target: site.id,
      metadata: { name: site.name },
      occurredAt: new Date().toISOString(),
    })
    return c.json({ site }, 201)
  })

  app.delete('/v1/sites/:id', clerkAuth({ resolveSession }), async (c) => {
    const auth = c.get('auth')
    const id = c.req.param('id')
    const site = await storage.sites.get(id)
    // 404 covers both "doesn't exist" and "exists but owned by another org"
    // so we don't leak ownership via the status code.
    if (!site || site.orgId !== auth.orgId) {
      return c.json({ error: 'not_found' }, 404)
    }
    await storage.sites.delete(id)
    await storage.audit.insert({
      id: auditId(),
      orgId: auth.orgId,
      actor: auth.apiKeyId,
      action: 'sites.delete',
      target: id,
      metadata: { name: site.name },
      occurredAt: new Date().toISOString(),
    })
    return c.json({ ok: true })
  })

  return app
}
