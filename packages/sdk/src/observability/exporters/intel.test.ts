import { describe, expect, it, vi } from 'vitest'
import type { TraceEvent } from '@agentronics/protocol'
import { createIntelExporter } from './intel.js'

const event: TraceEvent = {
  id: 'evt_1',
  siteId: 'shop-acme',
  sessionId: 's1',
  occurredAt: '2026-06-23T12:00:00.000Z',
  type: 'agent.detected',
  outcome: 'success',
  metadata: {},
}

describe('createIntelExporter', () => {
  it('POSTs a TraceBatch to /v1/sdk/events with the ingest key', async () => {
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ ok: true, accepted: 1 }), { status: 202 })
    )
    const exporter = createIntelExporter({
      url: 'https://intel-api.example.com',
      ingestKey: 'agtx_ik_test',
      fetcher: fetcher as unknown as typeof fetch,
    })
    await exporter.export([event])

    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe('https://intel-api.example.com/v1/sdk/events')
    expect(init?.method).toBe('POST')
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer agtx_ik_test')
    const body = JSON.parse(init?.body as string)
    expect(body.events[0].id).toBe('evt_1')
  })

  it('does not double-append the path when given the full ingest URL', async () => {
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 202 })
    )
    const exporter = createIntelExporter({
      url: 'https://intel-api.example.com/v1/sdk/events',
      ingestKey: 'k',
      fetcher: fetcher as unknown as typeof fetch,
    })
    await exporter.export([event])
    expect(fetcher.mock.calls[0]![0]).toBe('https://intel-api.example.com/v1/sdk/events')
  })

  it('throws on a non-2xx response', async () => {
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) => new Response('no', { status: 401 })
    )
    const exporter = createIntelExporter({
      url: 'https://x',
      ingestKey: 'k',
      fetcher: fetcher as unknown as typeof fetch,
    })
    await expect(exporter.export([event])).rejects.toThrow(/401/)
  })
})
