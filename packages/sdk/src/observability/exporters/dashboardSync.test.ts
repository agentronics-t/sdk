// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createDashboardSync } from './intel.js'
import { createTraceRelay } from '../../server/relay.js'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('dashboard sync', () => {
  it('pulls policies + approved tool descriptions for the site', async () => {
    const fetcher = vi.fn(async () =>
      json({ policies: [{ id: 'p1', tool: 'checkout', minTrust: 'verified', allowedClasses: [], decision: 'review' }], toolDescriptions: { search: 'Search the catalogue.' }, fetchedAt: '2026-10-24T00:00:00Z' })
    )
    const sync = createDashboardSync({ url: 'https://api.example', ingestKey: 'agtx_ik_x', siteId: 'shop', fetcher: fetcher as unknown as typeof fetch })
    const config = await sync.pullConfig()
    expect(config.policies[0]).toMatchObject({ tool: 'checkout', decision: 'review' })
    expect(config.toolDescriptions).toEqual({ search: 'Search the catalogue.' })
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.example/v1/sdk/config')
    expect(JSON.parse(String(init.body))).toEqual({ siteId: 'shop' })
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer agtx_ik_x')
  })

  it('verifies agent keys against the console and caches the answer', async () => {
    const fetcher = vi.fn(async () => json({ valid: true, agentId: 'booking', name: 'Booking agent', vendor: null }))
    const verify = createDashboardSync({ url: 'https://api.example', ingestKey: 'k', siteId: 's', fetcher: fetcher as unknown as typeof fetch }).keyVerifier()
    expect(await verify('agk_abc')).toEqual({ agentId: 'booking', name: 'Booking agent' })
    await verify('agk_abc')
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('treats unknown keys and console outages as "not verified"', async () => {
    const unknown = createDashboardSync({ url: 'u', ingestKey: 'k', siteId: 's', fetcher: (async () => json({ valid: false })) as unknown as typeof fetch }).keyVerifier()
    expect(await unknown('agk_x')).toBeNull()
    const down = createDashboardSync({ url: 'u', ingestKey: 'k', siteId: 's', fetcher: (async () => json({}, 503)) as unknown as typeof fetch }).keyVerifier()
    expect(await down('agk_x')).toBeNull()
  })
})

describe('trace relay', () => {
  it('pins events to the configured site, drops unknown types and always answers 202', async () => {
    const fetcher = vi.fn(async () => json({ ok: true }, 202))
    const relay = createTraceRelay({ url: 'https://api.example', ingestKey: 'agtx_ik_x', siteId: 'shop', fetcher: fetcher as unknown as typeof fetch })
    const res = await relay(
      new Request('https://shop.example/api/agentronics', {
        method: 'POST',
        body: JSON.stringify({ events: [{ id: 'e1', siteId: 'someone-else', type: 'tool.executed' }, { id: 'e2', type: 'evil.type' }] }),
      })
    )
    expect(res.status).toBe(202)
    const sent = JSON.parse(String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(sent.events).toEqual([{ id: 'e1', siteId: 'shop', type: 'tool.executed' }])
    expect(await relay(new Request('https://shop.example/x', { method: 'GET' }))).toMatchObject({ status: 405 })
  })
})

describe('well-known agent context', () => {
  it('serves the site memory from pullConfig, caches it, and keeps it when the console is down', async () => {
    const { createAgentContextHandler } = await import('../../server/agentContext.js')
    let up = true
    const pullConfig = vi.fn(async () => {
      if (!up) throw new Error('down')
      return { policies: [], toolDescriptions: {}, siteMemory: { siteMap: { pages: [{ path: '/' }] } }, fetchedAt: '' }
    })
    const handler = createAgentContextHandler({ sync: { pullConfig }, cacheSeconds: 0 })
    const res = await handler()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ siteMap: { pages: [{ path: '/' }] } })
    up = false
    expect((await handler()).status).toBe(200)
    const empty = createAgentContextHandler({ sync: { pullConfig: async () => ({ policies: [], toolDescriptions: {}, siteMemory: null, fetchedAt: '' }) } })
    expect((await empty()).status).toBe(404)
  })

  it('the relay also forwards batches to your own sink', async () => {
    const forward = vi.fn()
    const relay = createTraceRelay({ url: 'https://api.example', ingestKey: 'k', siteId: 'shop', forward, fetcher: (async () => json({}, 202)) as unknown as typeof fetch })
    await relay(new Request('https://shop.example/r', { method: 'POST', body: JSON.stringify({ events: [{ id: 'e', type: 'agent.detected' }] }) }))
    expect(forward).toHaveBeenCalledWith([{ id: 'e', type: 'agent.detected', siteId: 'shop' }])
  })
})
