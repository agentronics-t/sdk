import type { MiddlewareHandler } from 'hono'

export const securityHeaders = (): MiddlewareHandler => async (c, next) => {
  await next()
  c.header('x-content-type-options', 'nosniff')
  c.header('x-frame-options', 'DENY')
  c.header('referrer-policy', 'no-referrer')
  c.header('strict-transport-security', 'max-age=63072000; includeSubDomains; preload')
}
