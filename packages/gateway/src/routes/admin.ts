import { Hono } from 'hono'
import { z } from 'zod'
import { cronAuth } from '../middleware/cronAuth.js'
import {
  invalidateAllRemoteJwks,
  invalidateRemoteJwks,
} from '../auth/verifiers/jwks.js'

const Body = z.object({ jwksUri: z.string().url().optional() })

export interface AdminRoutesOptions {
  cronSecret: string | null
}

// Admin routes share the cron-secret auth surface. They cover the rare
// "drop everything cached, we just rotated keys" actions that operators
// need to be able to trigger out-of-band — otherwise a compromised IdP
// key would remain trusted until the JWKS cache TTL expired.
export const createAdminRoutes = ({ cronSecret }: AdminRoutesOptions) => {
  const app = new Hono()

  app.post('/v1/admin/keys/invalidate', cronAuth({ secret: cronSecret }), async (c) => {
    const parsed = Body.safeParse(await c.req.json().catch(() => ({})))
    if (!parsed.success) {
      return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)
    }
    if (parsed.data.jwksUri) {
      const removed = invalidateRemoteJwks(parsed.data.jwksUri)
      return c.json({ ok: true, scope: 'one', removed })
    }
    invalidateAllRemoteJwks()
    return c.json({ ok: true, scope: 'all' })
  })

  return app
}
