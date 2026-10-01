/**
 * @agentronics/sdk/next — agent authentication as Next.js middleware.
 *
 *   // middleware.ts
 *   import { agentronicsMiddleware } from '@agentronics/sdk/next'
 *   export default agentronicsMiddleware()
 *
 * Every request passes through. Verified agents reach your routes with
 * `x-agentronics-*` request headers (read them with readAgentHeaders from
 * '@agentronics/sdk/server'); unverified agents and humans browse as normal.
 * Runs on the edge runtime.
 */
import { createAgentAuthHandler, type AgentAuthHandlerOptions } from './middleware.js'

export function agentronicsMiddleware(options: AgentAuthHandlerOptions = {}) {
  const handle = createAgentAuthHandler(options)
  return async function middleware(request: Request): Promise<Response> {
    const { NextResponse } = await import('next/server')
    try {
      const out = await handle(request)
      return NextResponse.next({ request: { headers: out.headers } })
    } catch {
      // never take the site down over authentication — continue unauthenticated
      return NextResponse.next()
    }
  }
}

export type { AgentAuthHandlerOptions } from './middleware.js'
export { readAgentHeaders, withAgentHeaders } from './agentAuth.js'
