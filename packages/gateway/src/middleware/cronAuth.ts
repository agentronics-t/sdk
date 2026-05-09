import type { MiddlewareHandler } from 'hono'

export interface CronAuthOptions {
  secret: string | null
}

/**
 * Cron routes are invoked by Vercel Cron (or an equivalent scheduler). Auth is
 * a shared secret in the `x-cron-secret` header. When the secret is unset the
 * route refuses every request — there is no permissive default.
 */
export const cronAuth = ({ secret }: CronAuthOptions): MiddlewareHandler =>
  async (c, next) => {
    if (!secret) return c.json({ error: 'cron_disabled' }, 503)
    const provided = c.req.header('x-cron-secret')
    if (provided !== secret) return c.json({ error: 'unauthorized' }, 401)
    await next()
    return
  }
