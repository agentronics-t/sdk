/**
 * Drop-in request handlers built on createAgentAuth().
 *
 * - createAgentAuthHandler(): framework-agnostic (Fetch Request in, verdict out)
 * - expressAgentAuth():        Express / Connect middleware
 * - agentronicsMiddleware():   Next.js middleware — see '@agentronics/sdk/next'
 */
import {
  createAgentAuth,
  withAgentHeaders,
  type AgentAuthOptions,
  type AgentAuthResult,
  type Decision,
} from './agentAuth.js'

export interface AgentAuthHandlerOptions extends AgentAuthOptions {
  /** Called for every agent request (not for plain human traffic). Never awaited on the hot path. */
  onResult?: (event: { result: AgentAuthResult; decision: Decision; request: Request }) => void | Promise<void>
  /** Response sent to blocked agents. Default: 403 JSON. */
  blockedResponse?: (decision: Decision, result: AgentAuthResult) => Response
  /** Return false to skip a path (e.g. static assets). */
  matcher?: (url: URL) => boolean
}

export interface HandlerOutcome {
  result: AgentAuthResult
  decision: Decision
  /** Request headers to forward downstream (spoofed x-agentronics-* stripped). */
  headers: Headers
  /** Set when the request must be rejected. */
  blocked: Response | null
}

const defaultBlocked = (decision: Decision): Response =>
  new Response(JSON.stringify({ error: 'agent_not_allowed', reason: decision.reason }), {
    status: 403,
    headers: { 'content-type': 'application/json', 'x-agentronics-decision': 'block' },
  })

export function createAgentAuthHandler(options: AgentAuthHandlerOptions = {}) {
  const auth = createAgentAuth(options)
  return async function handle(request: Request): Promise<HandlerOutcome> {
    if (options.matcher && !options.matcher(new URL(request.url))) {
      const result: AgentAuthResult = { status: 'none' }
      return { result, decision: { action: 'allow', reason: 'skipped' }, headers: withAgentHeaders(request, result), blocked: null }
    }
    const result = await auth.authenticate(request)
    const decision = auth.decide(result)
    if (result.status !== 'none' && options.onResult) {
      // fire-and-forget: reporting must never slow or break the request
      void Promise.resolve()
        .then(() => options.onResult!({ result, decision, request }))
        .catch(() => undefined)
    }
    return {
      result,
      decision,
      headers: withAgentHeaders(request, result),
      blocked: decision.action === 'block' ? (options.blockedResponse ?? defaultBlocked)(decision, result) : null,
    }
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
interface NodeRes {
  statusCode: number
  setHeader(name: string, value: string): void
  end(body?: string): void
}

/**
 * Express middleware. Sets `req.agent` to the auth result and the
 * `x-agentronics-*` request headers for downstream handlers.
 * For correct `@authority`/client IP behind a proxy, set Express `trust proxy`.
 */
export function expressAgentAuth(options: AgentAuthHandlerOptions = {}) {
  const handle = createAgentAuthHandler(options)
  return (req: NodeReq, res: NodeRes, next: (err?: unknown) => void) => {
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) {
      if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v)
    }
    const host = headers.get('host') ?? 'localhost'
    const url = `${req.protocol ?? 'http'}://${host}${req.originalUrl ?? req.url ?? '/'}`
    handle(new Request(url, { method: req.method ?? 'GET', headers }))
      .then(async (out) => {
        req.agent = out.result
        for (const k of Object.keys(req.headers)) if (k.startsWith('x-agentronics-')) delete req.headers[k]
        out.headers.forEach((v, k) => {
          if (k.startsWith('x-agentronics-')) req.headers[k] = v
        })
        if (out.blocked) {
          res.statusCode = out.blocked.status
          out.blocked.headers.forEach((v, k) => res.setHeader(k, v))
          res.end(await out.blocked.text())
          return
        }
        next()
      })
      .catch(next)
  }
}
