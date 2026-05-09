import { describe, expect, it, vi } from 'vitest'
import { createPolicyCache } from './policyCache.js'

describe('policy cache', () => {
  it('syncs policies from the gateway with etag caching', async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          policies: [
            {
              id: 'browse',
              tool: 'catalog.*',
              minTrust: 'detected',
              allowedClasses: [],
              decision: 'allow',
            },
          ],
        }),
        { headers: { etag: 'v1' } }
      )
    )
    const cache = createPolicyCache({
      gatewayUrl: 'https://gateway.example',
      siteId: 'site_123',
      publishableKey: 'agtx_pk_demo_1234567890',
      fetcher,
    })

    const snapshot = await cache.sync()

    expect(snapshot.policies).toHaveLength(1)
    expect(snapshot.etag).toBe('v1')
    expect(fetcher).toHaveBeenCalledWith(
      'https://gateway.example/v1/sites/site_123/policies',
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer agtx_pk_demo_1234567890',
        }),
      })
    )
  })

  it('keeps the existing snapshot on 304', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ policies: [] }), { headers: { etag: 'v1' } })
      )
      .mockResolvedValueOnce(new Response(null, { status: 304 }))
    const cache = createPolicyCache({
      gatewayUrl: 'https://gateway.example',
      siteId: 'site_123',
      publishableKey: 'agtx_pk_demo_1234567890',
      fetcher,
    })

    await cache.sync()
    const snapshot = await cache.sync()
    expect(snapshot.etag).toBe('v1')
  })
})
