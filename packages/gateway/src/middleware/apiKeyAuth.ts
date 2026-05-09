import type { MiddlewareHandler } from 'hono'
import type { ApiKeyScope, ApiKeyRecord } from '../storage/types.js'
import { resolveApiKey } from '../auth/apiKeys.js'
import type { Storage } from '../storage/types.js'

export interface AuthContext {
  orgId: string
  scope: ApiKeyScope
  apiKeyId: string
  source: 'apiKey'
}

export interface ApiKeyAuthOptions {
  storage: Storage
  scopes: ApiKeyScope[]
}

declare module 'hono' {
  interface ContextVariableMap {
    auth: AuthContext
  }
}

const extractBearer = (header: string | undefined): string | null => {
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match?.[1] ?? null
}

export const apiKeyAuth = ({ storage, scopes }: ApiKeyAuthOptions): MiddlewareHandler =>
  async (c, next) => {
    const token = extractBearer(c.req.header('authorization'))
    if (!token) return c.json({ error: 'unauthorized', reason: 'missing_bearer' }, 401)
    const resolved = await resolveApiKey(storage.apiKeys, token)
    if (!resolved) return c.json({ error: 'unauthorized', reason: 'invalid_api_key' }, 401)
    if (!scopes.includes(resolved.scope)) {
      return c.json({ error: 'forbidden', reason: 'wrong_scope' }, 403)
    }
    const auth: AuthContext = {
      orgId: resolved.record.orgId,
      scope: resolved.scope,
      apiKeyId: resolved.record.id,
      source: 'apiKey',
    }
    c.set('auth', auth)
    await next()
    return
  }

export const ensureSiteOwnership = async (
  storage: Storage,
  siteId: string,
  auth: AuthContext
): Promise<{ ok: true } | { ok: false; status: 404 | 403 }> => {
  const site = await storage.sites.get(siteId)
  if (!site) return { ok: false, status: 404 }
  if (site.orgId !== auth.orgId) return { ok: false, status: 403 }
  return { ok: true }
}

export type { ApiKeyRecord }
