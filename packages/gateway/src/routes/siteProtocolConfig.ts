import { Hono } from 'hono'
import type { z } from 'zod'
import {
  MtlsConfigInput,
  SiteProtocolName,
  SpiffeConfigInput,
  SsoConfigInput,
} from '@agentronics/protocol'
import { clerkAuth, type ClerkAuthOptions } from '../middleware/clerkAuth.js'
import { ensureSiteOwnership } from '../middleware/apiKeyAuth.js'
import type { Storage } from '../storage/types.js'

const BODY_BY_PROTOCOL: Record<z.infer<typeof SiteProtocolName>, z.ZodTypeAny> = {
  sso: SsoConfigInput,
  spiffe: SpiffeConfigInput,
  mtls: MtlsConfigInput,
}

const auditId = (): string =>
  `aud_${Math.random().toString(36).slice(2, 12)}`

export const createSiteProtocolConfigRoutes = ({
  storage,
  resolveSession,
}: {
  storage: Storage
  resolveSession: ClerkAuthOptions['resolveSession']
}) => {
  const app = new Hono()

  app.get(
    '/v1/sites/:siteId/protocol-config',
    clerkAuth({ resolveSession }),
    async (c) => {
      const auth = c.get('auth')
      const siteId = c.req.param('siteId')
      const ownership = await ensureSiteOwnership(storage, siteId, auth)
      if (!ownership.ok) {
        return c.json({ error: 'not_found' }, 404)
      }
      const configs = await storage.siteProtocolConfig.listForSite(siteId)
      return c.json({ configs })
    }
  )

  app.put(
    '/v1/sites/:siteId/protocol-config/:protocol',
    clerkAuth({ resolveSession }),
    async (c) => {
      const auth = c.get('auth')
      const siteId = c.req.param('siteId')
      const protocolParam = c.req.param('protocol')
      const protocolParsed = SiteProtocolName.safeParse(protocolParam)
      if (!protocolParsed.success) {
        return c.json({ error: 'unsupported_protocol', protocol: protocolParam }, 400)
      }
      const ownership = await ensureSiteOwnership(storage, siteId, auth)
      if (!ownership.ok) {
        return c.json({ error: 'not_found' }, 404)
      }
      const protocol = protocolParsed.data
      const schema = BODY_BY_PROTOCOL[protocol]
      const bodyParsed = schema.safeParse(await c.req.json().catch(() => null))
      if (!bodyParsed.success) {
        return c.json({ error: 'invalid_body', issues: bodyParsed.error.issues }, 400)
      }
      const record = await storage.siteProtocolConfig.upsert({
        siteId,
        protocol,
        config: bodyParsed.data,
      })
      await storage.audit.insert({
        id: auditId(),
        orgId: auth.orgId,
        actor: auth.apiKeyId,
        action: 'protocol_config.upsert',
        target: `${siteId}:${protocol}`,
        metadata: { protocol, siteId },
        occurredAt: new Date().toISOString(),
      })
      return c.json({ config: record })
    }
  )

  app.delete(
    '/v1/sites/:siteId/protocol-config/:protocol',
    clerkAuth({ resolveSession }),
    async (c) => {
      const auth = c.get('auth')
      const siteId = c.req.param('siteId')
      const protocolParam = c.req.param('protocol')
      const protocolParsed = SiteProtocolName.safeParse(protocolParam)
      if (!protocolParsed.success) {
        return c.json({ error: 'unsupported_protocol', protocol: protocolParam }, 400)
      }
      const ownership = await ensureSiteOwnership(storage, siteId, auth)
      if (!ownership.ok) {
        return c.json({ error: 'not_found' }, 404)
      }
      const protocol = protocolParsed.data
      await storage.siteProtocolConfig.delete(siteId, protocol)
      await storage.audit.insert({
        id: auditId(),
        orgId: auth.orgId,
        actor: auth.apiKeyId,
        action: 'protocol_config.delete',
        target: `${siteId}:${protocol}`,
        metadata: { protocol, siteId },
        occurredAt: new Date().toISOString(),
      })
      return c.json({ ok: true })
    }
  )

  return app
}
