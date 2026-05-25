import { auditId } from '../util/ids.js'
import { Hono } from 'hono'
import {
  VerificationRequest,
  type AuthProtocol,
  type VerificationResult,
} from '@agentronics/protocol'
import { apiKeyAuth, ensureSiteOwnership } from '../middleware/apiKeyAuth.js'
import { verifyOidcIdToken } from '../auth/verifiers/sso.js'
import { verifySpiffeJwt } from '../auth/verifiers/spiffe.js'
import { verifyMtls } from '../auth/verifiers/mtls.js'
import type {
  MtlsConfig,
  SpiffeConfig,
  SsoConfig,
  Storage,
} from '../storage/types.js'

const SUPPORTED: ReadonlySet<AuthProtocol> = new Set([
  'sso',
  'spiffe',
  'google-agent',
  'mtls',
])

export const createVerifyRoutes = ({ storage }: { storage: Storage }) => {
  const app = new Hono()

  app.post(
    '/v1/verify/:protocol',
    apiKeyAuth({ storage, scopes: ['publishable', 'secret'] }),
    async (c) => {
      const protocolParam = c.req.param('protocol') as AuthProtocol
      if (!SUPPORTED.has(protocolParam)) {
        return c.json({ error: 'unsupported_protocol', protocol: protocolParam }, 400)
      }
      const auth = c.get('auth')
      const body = await c.req.json().catch(() => null)
      const parsed = VerificationRequest.safeParse(body)
      if (!parsed.success) {
        return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)
      }
      const { siteId, token, xfcc } = parsed.data

      const ownership = await ensureSiteOwnership(storage, siteId, auth)
      if (!ownership.ok) {
        return c.json(
          { error: ownership.status === 404 ? 'site_not_found' : 'site_not_owned' },
          ownership.status
        )
      }

      const audit = async (result: VerificationResult, protocol: AuthProtocol) => {
        await storage.audit.insert({
          id: auditId(),
          orgId: auth.orgId,
          actor: auth.apiKeyId,
          action: `verify.${protocol}`,
          target: result.subject ?? null,
          metadata: { vendor: result.vendor, trust: result.trust, protocol, siteId },
          occurredAt: new Date().toISOString(),
        })
      }

      try {
        if (protocolParam === 'sso') {
          if (!token) return c.json({ error: 'missing_token' }, 400)
          const cfg = await storage.siteProtocolConfig.getForSite(siteId, 'sso')
          if (!cfg) return c.json({ error: 'sso_not_configured' }, 404)
          const result = await verifyOidcIdToken(token, cfg.config as SsoConfig)
          await audit(result, 'sso')
          return c.json(result)
        }

        if (protocolParam === 'spiffe' || protocolParam === 'google-agent') {
          if (!token) return c.json({ error: 'missing_token' }, 400)
          const cfg = await storage.siteProtocolConfig.getForSite(siteId, 'spiffe')
          if (!cfg) return c.json({ error: 'spiffe_not_configured' }, 404)
          const result = await verifySpiffeJwt(token, cfg.config as SpiffeConfig)
          if (protocolParam === 'google-agent' && result.vendor !== 'google') {
            return c.json(
              { error: 'not_google_trust_domain', vendor: result.vendor },
              403
            )
          }
          await audit(result, protocolParam)
          return c.json({ ...result, protocol: protocolParam })
        }

        if (protocolParam === 'mtls') {
          if (!xfcc) return c.json({ error: 'missing_xfcc' }, 400)
          const cfg = await storage.siteProtocolConfig.getForSite(siteId, 'mtls')
          if (!cfg) return c.json({ error: 'mtls_not_configured' }, 404)
          const result = await verifyMtls(xfcc, cfg.config as MtlsConfig)
          await audit(result, 'mtls')
          return c.json(result)
        }

        return c.json({ error: 'unsupported_protocol' }, 400)
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'verify_failed'
        return c.json({ error: 'verify_failed', reason }, 400)
      }
    }
  )

  return app
}
