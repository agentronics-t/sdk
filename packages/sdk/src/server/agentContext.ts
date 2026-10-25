/**
 * Serve `/.well-known/agent-context.json` — your site memory, for any agent,
 * with no SDK on their side — from what you manage in the Agentronics console.
 *
 *   // app/.well-known/agent-context.json/route.ts (Next.js)
 *   export const GET = createAgentContextHandler({ sync })
 *
 * The snapshot comes from `sync.pullConfig()` (the last `pushMemory()` for this
 * site), cached in memory. If the console can't be reached, the last good
 * snapshot keeps being served; with none, the route answers 404.
 */
import type { IntelSync } from '../observability/exporters/intel.js'

export interface AgentContextHandlerOptions {
  sync: Pick<IntelSync, 'pullConfig'>
  /** How long to reuse a snapshot. Default 300 s. */
  cacheSeconds?: number
}

export function createAgentContextHandler({ sync, cacheSeconds = 300 }: AgentContextHandlerOptions) {
  let cached: { body: string; until: number } | null = null
  return async function agentContext(): Promise<Response> {
    if (!cached || cached.until <= Date.now()) {
      try {
        const { siteMemory } = await sync.pullConfig()
        if (siteMemory && Object.keys(siteMemory).length) cached = { body: JSON.stringify(siteMemory), until: Date.now() + cacheSeconds * 1000 }
      } catch {
        // keep serving the last good snapshot
      }
    }
    if (!cached) return new Response(JSON.stringify({ error: 'no_site_memory' }), { status: 404, headers: { 'content-type': 'application/json' } })
    return new Response(cached.body, {
      headers: {
        'content-type': 'application/json',
        'cache-control': `public, max-age=${cacheSeconds}`,
        'access-control-allow-origin': '*',
      },
    })
  }
}
