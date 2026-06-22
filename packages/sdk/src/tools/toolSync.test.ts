import { describe, expect, it, vi } from 'vitest'
import { createToolSync, toToolDescriptor } from './toolSync.js'
import type { GovernedTool } from './registry.js'

const tool: GovernedTool = {
  name: 'cart.add',
  group: 'cart',
  stage: 'browse',
  description: 'Add an item to the cart.',
  inputSchema: { type: 'object', properties: { itemId: { type: 'string' } } },
  outputSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  execute: () => ({ ok: true }),
}

describe('toToolDescriptor', () => {
  it('maps stage→page, keeps schemas, and estimates tokens', () => {
    const d = toToolDescriptor(tool)
    expect(d.name).toBe('cart.add')
    expect(d.group).toBe('cart')
    expect(d.page).toBe('browse')
    expect(d.inputSchema).toMatchObject({ type: 'object' })
    expect(d.outputSchema).toMatchObject({ type: 'object' })
    expect(d.tokens).toBeGreaterThan(0)
  })

  it('defaults description/inputSchema and omits absent optionals', () => {
    const d = toToolDescriptor({ name: 'x', execute: () => null })
    expect(d.description).toBe('')
    expect(d.inputSchema).toEqual({})
    expect(d.outputSchema).toBeUndefined()
    expect(d.group).toBeUndefined()
    expect(d.page).toBeUndefined()
  })
})

describe('createToolSync.push', () => {
  it('PUTs the registry to the site tools endpoint with the publishable key', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true, count: 1 }), { status: 200 }))
    const sync = createToolSync({
      gatewayUrl: 'https://gw.example.com/',
      siteId: 'shop acme',
      publishableKey: 'agtx_pk_test',
      fetcher: fetcher as unknown as typeof fetch,
    })
    const count = await sync.push([tool])
    expect(count).toBe(1)
    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe('https://gw.example.com/v1/sites/shop%20acme/tools')
    expect(init?.method).toBe('PUT')
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer agtx_pk_test')
    const body = JSON.parse(init?.body as string)
    expect(body.registry.tools[0].name).toBe('cart.add')
  })

  it('throws on non-2xx', async () => {
    const fetcher = vi.fn(async () => new Response('nope', { status: 403 }))
    const sync = createToolSync({
      gatewayUrl: 'https://gw.example.com',
      siteId: 's',
      publishableKey: 'k',
      fetcher: fetcher as unknown as typeof fetch,
    })
    await expect(sync.push([tool])).rejects.toThrow(/403/)
  })
})
