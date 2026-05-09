import type { MiddlewareHandler } from 'hono'
import type { AuthContext } from './apiKeyAuth.js'

export interface ClerkSession {
  userId: string
  orgId: string
}

export interface ClerkAuthOptions {
  /**
   * Resolves a session from the request. Returns null when the session is missing
   * or invalid. The real Clerk integration lands in Phase 9; this hook lets the
   * gateway accept dashboard mutations from a stub during Phase 8a.
   */
  resolveSession: (headers: Headers) => Promise<ClerkSession | null>
}

export const clerkAuth = ({ resolveSession }: ClerkAuthOptions): MiddlewareHandler =>
  async (c, next) => {
    const session = await resolveSession(new Headers(c.req.raw.headers))
    if (!session) return c.json({ error: 'unauthorized', reason: 'missing_session' }, 401)
    const auth: AuthContext = {
      orgId: session.orgId,
      scope: 'secret',
      apiKeyId: `clerk:${session.userId}`,
      source: 'apiKey',
    }
    c.set('auth', auth)
    await next()
    return
  }

export const eitherAuth = (
  apiKey: MiddlewareHandler,
  clerk: MiddlewareHandler
): MiddlewareHandler =>
  async (c, next) => {
    const authHeader = c.req.header('authorization') ?? ''
    if (/^Bearer\s+agtx_/i.test(authHeader.trim())) {
      return apiKey(c, next)
    }
    return clerk(c, next)
  }
