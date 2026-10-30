import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TraceEvent } from '@agentronics/protocol'
import { createGatewayExporter } from './gateway.js'

const ev = (i: number) =>
  ({ id: `e${i}`, siteId: 's', sessionId: 'x', occurredAt: new Date(0).toISOString(), type: 'agent.detected', outcome: 'success', metadata: {} }) as unknown as TraceEvent

const fakeFetch = () => {
  const bodies: { events: TraceEvent[] }[] = []
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)))
    return new Response(null, { status: 202 })
  }) as unknown as typeof fetch
  return { fetcher, bodies }
}

describe('gateway exporter', () => {
  afterEach(() => vi.useRealTimers())

  it('batches events into one request per interval instead of one per event', async () => {
    vi.useFakeTimers()
    const { fetcher, bodies } = fakeFetch()
    const exp = createGatewayExporter({ gatewayUrl: 'https://api.agentronics.dev', publishableKey: 'agtx_pk_live_x', fetcher })
    for (let i = 0; i < 7; i++) await exp.export([ev(i)])
    expect(fetcher).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2000)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(bodies[0]!.events).toHaveLength(7)
  })

  it('sends a full batch at once and never more than 100 events per request', async () => {
    const { fetcher, bodies } = fakeFetch()
    const exp = createGatewayExporter({ gatewayUrl: 'https://api.agentronics.dev', publishableKey: 'k', fetcher, maxBatch: 500 })
    exp.export(Array.from({ length: 250 }, (_, i) => ev(i)))
    await Promise.resolve()
    expect(bodies.map((b) => b.events.length)).toEqual([100, 100, 50])
  })

  it('never throws into the page when the network fails, and caps its queue', async () => {
    vi.useFakeTimers()
    const rejecting = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    const throwing = vi.fn(() => {
      throw new Error('blocked')
    }) as unknown as typeof fetch
    for (const fetcher of [rejecting, throwing]) {
      const exp = createGatewayExporter({ gatewayUrl: 'https://api.agentronics.dev', publishableKey: 'k', fetcher })
      expect(() => exp.export([ev(1)])).not.toThrow()
      await vi.advanceTimersByTimeAsync(2000)
      expect(() => exp.flush(true)).not.toThrow()
    }
    const { fetcher, bodies } = fakeFetch()
    const exp = createGatewayExporter({ gatewayUrl: 'https://api.agentronics.dev', publishableKey: 'k', fetcher, maxBatch: 100, maxQueue: 5 })
    for (let i = 0; i < 20; i++) exp.export([ev(i)])
    exp.flush()
    await Promise.resolve()
    expect(bodies[0]!.events.map((e) => e.id)).toEqual(['e15', 'e16', 'e17', 'e18', 'e19'])
  })
})
