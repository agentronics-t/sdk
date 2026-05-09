import { describe, expect, it } from 'vitest'
import { TraceEvent } from '@agentronics/protocol'
import {
  createGatewayExporter,
  createMemoryCache,
  createPolicyCache,
  createSignatureLoader,
  fetchWellKnownContext,
} from '@agentronics/sdk'
import { buildFixture } from './fixtures.js'

const GATEWAY_URL = 'http://gateway.test'

describe('SDK ↔ Gateway round-trip', () => {
  it('policyCache + memoryCache + signatureLoader + gatewayExporter all flow against real routes', async () => {
    const fixture = await buildFixture()
    await fixture.storage.policies.put(fixture.orgA.siteId, {
      policies: [
        {
          id: 'tool:cart.checkout',
          tool: 'cart.checkout',
          minTrust: 'verified',
          allowedClasses: [],
          decision: 'allow',
        },
      ],
      etag: 'W/"seed"',
      updatedAt: new Date().toISOString(),
    })
    await fixture.storage.memory.put(fixture.orgA.siteId, {
      memory: { policies: { shipping: 'Free over $50' } } as never,
      etag: 'W/"mem"',
      updatedAt: new Date().toISOString(),
    })

    const policyCache = createPolicyCache({
      gatewayUrl: GATEWAY_URL,
      siteId: fixture.orgA.siteId,
      publishableKey: fixture.orgA.publishable,
      fetcher: fixture.fetcher,
    })
    const memoryCache = createMemoryCache({
      gatewayUrl: GATEWAY_URL,
      siteId: fixture.orgA.siteId,
      publishableKey: fixture.orgA.publishable,
      fetcher: fixture.fetcher,
    })
    const signatures = createSignatureLoader({
      gatewayUrl: GATEWAY_URL,
      fetcher: fixture.fetcher,
    })
    const exporter = createGatewayExporter({
      gatewayUrl: GATEWAY_URL,
      publishableKey: fixture.orgA.publishable,
      fetcher: fixture.fetcher,
    })

    const policySnapshot = await policyCache.sync()
    expect(policySnapshot.policies).toHaveLength(1)
    expect(policySnapshot.etag).toBe('W/"seed"')

    const memorySnapshot = await memoryCache.sync()
    expect(memorySnapshot.memory?.policies.shipping).toBe('Free over $50')

    const sigs = await signatures.sync()
    expect(sigs[0]?.id).toBe('gpt')

    await exporter.export([
      TraceEvent.parse({
        id: 'trc_int',
        siteId: fixture.orgA.siteId,
        sessionId: 'ses_1',
        occurredAt: new Date().toISOString(),
        type: 'tool.executed',
        outcome: 'success',
        metadata: {},
      }),
    ])
    expect(await fixture.storage.traces.list(fixture.orgA.id)).toHaveLength(1)

    const wellKnown = await fetchWellKnownContext({
      origin: GATEWAY_URL,
      fetcher: (input, init) => {
        const url = typeof input === 'string' ? input : (input as Request).url
        const rewritten = url.replace(
          '/.well-known/agent-context.json',
          `/v1/sites/${fixture.orgA.siteId}/.well-known/agent-context.json`
        )
        return fixture.fetcher(rewritten, init)
      },
    })
    expect(wellKnown?.policies.shipping).toBe('Free over $50')
  })
})
