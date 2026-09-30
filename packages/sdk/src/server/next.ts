/**
 * @agentronics/sdk/next — agent authentication as Next.js middleware.
 *
 *   // middleware.ts
 *   import { agentronicsMiddleware } from '@agentronics/sdk/next'
 *   export default agentronicsMiddleware({ rules: { unverified: 'block' } })
 *
 * Verified agents reach your routes with `x-agentronics-*` request headers
 * (read them with readAgentHeaders from '@agentronics/sdk/server'); blocked
 * agents get a 403. Runs on the edge runtime.
 */
import { createAgentAuthHandler, type AgentAuthHandlerOptions } from './middleware.js'

export function agentronicsMiddleware(options: AgentAuthHandlerOptions = {}) {
  const handle = createAgentAuthHandler(options)
  return async function middleware(request: Request): Promise<Response> {
    const { NextResponse } = await import('next/server')
    const out = await handle(request)
    if (out.blocked) return out.blocked
    return NextResponse.next({ request: { headers: out.headers } })
  }
}

export type { AgentAuthHandlerOptions } from './middleware.js'
export { readAgentHeaders, withAgentHeaders } from './agentAuth.js'
