/**
 * Relay browser traces to the Agentronics console.
 *
 * The browser SDK can't hold the ingest key (it's a secret), so it posts its
 * traces to a route on your own site (`init({ trace: { webhookUrl: '/api/agentronics' } })`)
 * and this handler forwards them with the key:
 *
 *   // app/api/agentronics/route.ts (Next.js)
 *   const relay = createTraceRelay({ url: process.env.AGENTRONICS_API_URL!, ingestKey: process.env.AGENTRONICS_INGEST_KEY!, siteId: 'shop' })
 *   export const POST = relay
 *
 * Every event is pinned to your `siteId`, batches are capped, and the relay
 * always answers 202 quickly — a console outage never breaks the page.
 */
import { createIntelExporter } from '../observability/exporters/intel.js'

export interface TraceRelayOptions {
  url: string
  ingestKey: string
  /** Events are re-labelled with this site id, whatever the browser sent. */
  siteId: string
  /** Max events accepted per request. Default 100. */
  maxEvents?: number
  fetcher?: typeof fetch
}

const KNOWN_TYPES = new Set([
  'agent.detected',
  'agent.missed',
  'auth.identity_presented',
  'auth.identity_cleared',
  'authz.policies_set',
  'authz.evaluated',
  'memory.accessed',
  'memory.updated',
  'tool.registered',
  'tool.executed',
  'tool.surfaced',
  'tool.progressed',
  'sdk.error',
])

export function createTraceRelay(options: TraceRelayOptions) {
  const exporter = createIntelExporter({ url: options.url, ingestKey: options.ingestKey, ...(options.fetcher ? { fetcher: options.fetcher } : {}) })
  const max = options.maxEvents ?? 100
  return async function relay(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response(null, { status: 405 })
    let body: { events?: unknown }
    try {
      const text = await request.text()
      if (text.length > 512_000) return new Response(null, { status: 413 })
      body = JSON.parse(text) as { events?: unknown }
    } catch {
      return new Response(null, { status: 400 })
    }
    const events = (Array.isArray(body.events) ? body.events : [])
      .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null && KNOWN_TYPES.has(String((e as { type?: unknown }).type)))
      .slice(0, max)
      .map((e) => ({ ...e, siteId: options.siteId })) as unknown as Parameters<typeof exporter.export>[0]
    if (events.length) await Promise.resolve(exporter.export(events)).catch(() => undefined)
    return new Response(null, { status: 202 })
  }
}
