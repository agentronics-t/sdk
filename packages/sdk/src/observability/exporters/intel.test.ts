import { describe, expect, it, vi } from 'vitest'
import type { TraceEvent } from '@agentronics/protocol'
import type { GovernedTool } from '../../tools/registry.js'
import { createIntelExporter, createIntelSync } from './intel.js'

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

describe('createIntelSync', () => {
  const tool: GovernedTool = {
    name: 'cart.add',
    group: 'cart',
    stage: 'browse',
    description: 'Add an item to the cart.',
    inputSchema: { type: 'object', properties: { itemId: { type: 'string' } } },
    outputSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
    execute: () => ({ ok: true }),
  }

  it('pushTools maps GovernedTools and POSTs to /v1/sdk/tools', async () => {
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ ok: true, tools: 1 }), { status: 202 })
    )
    const sync = createIntelSync({
      url: 'https://intel-api.example.com',
      ingestKey: 'agtx_ik_test',
      siteId: 'shop-acme',
      fetcher: fetcher as unknown as typeof fetch,
    })
    const n = await sync.pushTools([tool])
    expect(n).toBe(1)

    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe('https://intel-api.example.com/v1/sdk/tools')
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer agtx_ik_test')
    const body = JSON.parse(init?.body as string)
    expect(body.siteId).toBe('shop-acme')
    expect(body.tools[0].name).toBe('cart.add')
    expect(body.tools[0].page).toBe('browse') // stage → page
    expect(body.tools[0].tokens).toBeGreaterThan(0)
  })

  it('pushMemory POSTs the snapshot + score to /v1/sdk/memory', async () => {
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 202 })
    )
    const sync = createIntelSync({
      url: 'https://intel-api.example.com',
      ingestKey: 'k',
      siteId: 'shop-acme',
      fetcher: fetcher as unknown as typeof fetch,
    })
    await sync.pushMemory({ siteMap: { pages: [] }, policies: { returns: '30d' } }, 82)

    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe('https://intel-api.example.com/v1/sdk/memory')
    const body = JSON.parse(init?.body as string)
    expect(body.siteId).toBe('shop-acme')
    expect(body.score).toBe(82)
    expect(body.snapshot.policies.returns).toBe('30d')
  })
})
