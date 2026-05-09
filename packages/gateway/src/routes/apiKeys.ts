import { Hono } from 'hono'
import { z } from 'zod'
import { clerkAuth, type ClerkAuthOptions } from '../middleware/clerkAuth.js'
import { issueApiKeyPair } from '../auth/apiKeys.js'
import type { Storage } from '../storage/types.js'

const Body = z.object({ label: z.string().min(1).max(60) })

export const createApiKeyRoutes = ({
  storage,
  resolveSession,
}: {
  storage: Storage
  resolveSession: ClerkAuthOptions['resolveSession']
}) => {
  const app = new Hono()

  app.post('/v1/api-keys', clerkAuth({ resolveSession }), async (c) => {
    const auth = c.get('auth')
    const parsed = Body.safeParse(await c.req.json())
    if (!parsed.success) {
      return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)
    }
    const pair = await issueApiKeyPair(storage.apiKeys, {
      orgId: auth.orgId,
      label: parsed.data.label,
    })
    await storage.audit.insert({
      id: `aud_${Math.random().toString(36).slice(2, 12)}`,
      orgId: auth.orgId,
      actor: auth.apiKeyId,
      action: 'api_keys.create',
      target: pair.publishable.record.id,
      metadata: { label: parsed.data.label },
      occurredAt: new Date().toISOString(),
    })
    return c.json(
      {
        publishable: { id: pair.publishable.record.id, key: pair.publishable.plaintext },
        secret: { id: pair.secret.record.id, key: pair.secret.plaintext },
      },
      201
    )
  })

  app.get('/v1/api-keys', clerkAuth({ resolveSession }), async (c) => {
    const auth = c.get('auth')
    const records = await storage.apiKeys.listForOrg(auth.orgId)
    return c.json({
      keys: records.map((record) => ({
        id: record.id,
        scope: record.scope,
        prefix: record.prefix,
        label: record.label,
        createdAt: record.createdAt,
        revokedAt: record.revokedAt,
      })),
    })
  })

  app.delete('/v1/api-keys/:id', clerkAuth({ resolveSession }), async (c) => {
    const auth = c.get('auth')
    const id = c.req.param('id')
    const records = await storage.apiKeys.listForOrg(auth.orgId)
    const target = records.find((record) => record.id === id)
    if (!target) return c.json({ error: 'not_found' }, 404)
    if (target.revokedAt) return c.json({ ok: true, alreadyRevoked: true })
    const occurredAt = new Date().toISOString()
    await storage.apiKeys.revoke(id, occurredAt)
    await storage.audit.insert({
      id: `aud_${Math.random().toString(36).slice(2, 12)}`,
      orgId: auth.orgId,
      actor: auth.apiKeyId,
      action: 'api_keys.revoke',
      target: id,
      metadata: { scope: target.scope, label: target.label },
      occurredAt,
    })
    return c.json({ ok: true, revokedAt: occurredAt })
  })

  return app
}
