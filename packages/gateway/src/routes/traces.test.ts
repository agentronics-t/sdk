import { describe, expect, it } from 'vitest'
import { TraceEvent } from '@agentronics/protocol'
import { buildFixture } from '../test/fixtures.js'

const sampleEvent = (siteId: string) =>
  TraceEvent.parse({
    id: 'trc_1',
    siteId,
    sessionId: 'ses_1',
    occurredAt: new Date().toISOString(),
    type: 'tool.executed',
    outcome: 'success',
    metadata: {},
  })

describe('trace routes', () => {
  it('accepts a publishable-key batch and stores it', async () => {
    const fixture = await buildFixture()
    const res = await fixture.app.request('/v1/traces', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${fixture.orgA.publishable}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        publishableKey: fixture.orgA.publishable,
        events: [sampleEvent(fixture.orgA.siteId)],
      }),
    })
    expect(res.status).toBe(202)
    const body = (await res.json()) as { accepted: number }
    expect(body.accepted).toBe(1)
    expect(await fixture.storage.traces.list(fixture.orgA.id)).toHaveLength(1)
  })

  it('rejects missing bearer with 401', async () => {
    const fixture = await buildFixture()
    const res = await fixture.app.request('/v1/traces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ publishableKey: 'x', events: [sampleEvent(fixture.orgA.siteId)] }),
    })
    expect(res.status).toBe(401)
  })

  it('GET /v1/traces requires the secret key', async () => {
    const fixture = await buildFixture()
    const res = await fixture.app.request('/v1/traces', {
      headers: { authorization: `Bearer ${fixture.orgA.publishable}` },
    })
    expect(res.status).toBe(403)
  })

  it('cross-tenant trace ingest stays scoped to the calling org', async () => {
    const fixture = await buildFixture()
    await fixture.app.request('/v1/traces', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${fixture.orgA.publishable}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        publishableKey: fixture.orgA.publishable,
        events: [sampleEvent(fixture.orgA.siteId)],
      }),
    })
    expect(await fixture.storage.traces.list(fixture.orgB.id)).toHaveLength(0)
  })

  it('rejects a trace whose siteId is not registered to the key\'s org with 403', async () => {
    const fixture = await buildFixture()
    const res = await fixture.app.request('/v1/traces', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${fixture.orgA.publishable}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        publishableKey: fixture.orgA.publishable,
        events: [sampleEvent(fixture.orgB.siteId)],
      }),
    })
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: string; siteId: string }
    expect(body.error).toBe('site_not_owned')
    expect(body.siteId).toBe(fixture.orgB.siteId)
    expect(await fixture.storage.traces.list(fixture.orgA.id)).toHaveLength(0)
  })
})
