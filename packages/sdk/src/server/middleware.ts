/**
 * Drop-in request handlers built on createAgentAuth().
 *
 * - createAgentAuthHandler(): framework-agnostic (Fetch Request in, identity out)
 * - expressAgentAuth():        Express / Connect middleware
 * - agentronicsMiddleware():   Next.js middleware — see '@agentronics/sdk/next'
 *
 * None of these ever block a request. They authenticate the agent (if any),
 * attach the result as `x-agentronics-*` request headers, and pass every
 * request through — verified agents, unverified agents and humans alike.
 */
import { createAgentAuth, withAgentHeaders, type AgentAuthOptions, type AgentAuthResult } from './agentAuth.js'

export interface AgentAuthHandlerOptions extends AgentAuthOptions {
  /** Called for every agent request (not for plain human traffic). Never awaited on the hot path. */
  onResult?: (event: { result: AgentAuthResult; request: Request }) => void | Promise<void>
  /** Return false to skip a path (e.g. static assets). */
  matcher?: (url: URL) => boolean
}

export interface HandlerOutcome {
  result: AgentAuthResult
  /** Request headers to forward downstream (spoofed x-agentronics-* stripped). */
  headers: Headers
}

export function createAgentAuthHandler(options: AgentAuthHandlerOptions = {}) {
  const auth = createAgentAuth(options)
  return async function handle(request: Request): Promise<HandlerOutcome> {
    if (options.matcher && !options.matcher(new URL(request.url))) {
      const result: AgentAuthResult = { status: 'none' }
      return { result, headers: withAgentHeaders(request, result) }
    }
    const result = await auth.authenticate(request)
    if (result.status !== 'none' && options.onResult) {
      // fire-and-forget: reporting must never slow or break the request
      void Promise.resolve()
        .then(() => options.onResult!({ result, request }))
        .catch(() => undefined)
    }
    return { result, headers: withAgentHeaders(request, result) }
  }
}

// ---- Express / Connect -----------------------------------------------------

interface NodeReq {
  method?: string
  url?: string
  originalUrl?: string
  protocol?: string
  headers: Record<string, string | string[] | undefined>
  agent?: AgentAuthResult
}

/**
 * Express middleware. Sets `req.agent` to the auth result and the
 * `x-agentronics-*` request headers for downstream handlers, then always
 * calls next(). For correct `@authority`/client IP behind a proxy, set
 * Express `trust proxy`.
 */
export function expressAgentAuth(options: AgentAuthHandlerOptions = {}) {
  const handle = createAgentAuthHandler(options)
  return (req: NodeReq, _res: unknown, next: (err?: unknown) => void) => {
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) {
      if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v)
    }
    const host = headers.get('host') ?? 'localhost'
    const url = `${req.protocol ?? 'http'}://${host}${req.originalUrl ?? req.url ?? '/'}`
    handle(new Request(url, { method: req.method ?? 'GET', headers }))
      .then((out) => {
        req.agent = out.result
        for (const k of Object.keys(req.headers)) if (k.startsWith('x-agentronics-')) delete req.headers[k]
        out.headers.forEach((v, k) => {
          if (k.startsWith('x-agentronics-')) req.headers[k] = v
        })
        next()
      })
      // Authentication problems must never take the site down — fall through
      // as unauthenticated traffic.
      .catch(() => {
        for (const k of Object.keys(req.headers)) if (k.startsWith('x-agentronics-')) delete req.headers[k]
        req.agent = { status: 'none' }
        next()
      })
  }
}
