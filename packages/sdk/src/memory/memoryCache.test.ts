import { describe, expect, it, vi } from 'vitest'
import { createMemoryCache } from './memoryCache.js'

describe('memory cache', () => {
  it('syncs site memory from the gateway with etag caching', async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          memory: {
            version: '1',
            siteMap: { pages: [{ path: '/', name: 'Home' }] },
          },
        }),
        { headers: { etag: 'mem-1' } }
      )
    )
    const cache = createMemoryCache({
      gatewayUrl: 'https://gateway.example',
      siteId: 'site_123',
      publishableKey: 'agtx_pk_demo_1234567890',
      fetcher,
    })

    const snapshot = await cache.sync()

    expect(snapshot.memory?.siteMap?.pages[0]?.name).toBe('Home')
    expect(snapshot.etag).toBe('mem-1')
    expect(fetcher).toHaveBeenCalledWith(
      'https://gateway.example/v1/sites/site_123/memory',
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer agtx_pk_demo_1234567890',
        }),
      })
    )
  })

  it('keeps the cached snapshot on 304', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ memory: { version: '1' } }),
          { headers: { etag: 'mem-1' } }
        )
      )
      .mockResolvedValueOnce(new Response(null, { status: 304 }))

    const cache = createMemoryCache({
      gatewayUrl: 'https://gateway.example',
      siteId: 'site_123',
      publishableKey: 'agtx_pk_demo_1234567890',
      fetcher,
    })

    await cache.sync()
    const snapshot = await cache.sync()
    expect(snapshot.etag).toBe('mem-1')
    expect(snapshot.memory?.version).toBe('1')
    const secondCall = fetcher.mock.calls[1]?.[1] as RequestInit | undefined
    expect((secondCall?.headers as Record<string, string>)['if-none-match']).toBe('mem-1')
  })
})
