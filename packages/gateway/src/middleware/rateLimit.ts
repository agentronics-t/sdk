import type { Context, MiddlewareHandler } from 'hono'
import type { RateLimitRepository } from '../storage/types.js'

export interface RateLimitOptions {
  windowSeconds: number
  max: number
  storage: { rateLimit: RateLimitRepository }
  /** Customize the rate-limit bucket key. Defaults to API key id, then IP. */
  keyFn?: (c: Context) => string
  /** Tag prepended to the storage key so different routes don't share buckets. */
  scope: string
}

const fallbackKey = (c: Context): string =>
  c.get('auth')?.apiKeyId ??
  c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
  c.req.header('x-real-ip') ??
  'anonymous'

export const createRateLimit = ({
  windowSeconds,
  max,
  storage,
  scope,
  keyFn,
}: RateLimitOptions): MiddlewareHandler =>
  async (c, next) => {
    const principal = keyFn ? keyFn(c) : fallbackKey(c)
    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
      c.req.header('x-real-ip') ??
      'anonymous'

    // Check both principal-scoped and IP-scoped buckets so a single noisy IP
    // can't burn an org's budget and a single org can't overload one IP.
    const principalHit = await storage.rateLimit.hit(
      `${scope}:principal:${principal}`,
      windowSeconds
    )
    const ipHit = await storage.rateLimit.hit(`${scope}:ip:${ip}`, windowSeconds)
    const exceeded =
      principalHit.count > max ? principalHit : ipHit.count > max ? ipHit : null
    if (exceeded) {
      c.header('retry-after', Math.ceil((exceeded.resetAt - Date.now()) / 1000).toString())
      return c.json({ error: 'rate_limited', max, windowSeconds }, 429)
    }

    await next()
    return
  }
