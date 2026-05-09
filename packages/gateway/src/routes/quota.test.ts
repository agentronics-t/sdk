import { describe, expect, it } from 'vitest'
import type { TraceEvent } from '@agentronics/protocol'
import { buildFixture } from '../test/fixtures.js'

const toolExecuted = (siteId: string, idx: number): TraceEvent => ({
  id: `trc_${idx}`,
  siteId,
  sessionId: 'ses_1',
  occurredAt: new Date().toISOString(),
  type: 'tool.executed',
  outcome: 'success',
  metadata: {},
})

describe('quota enforcement', () => {
  it('returns 429 quota_exceeded once the monthly limit is crossed', async () => {
    const fixture = await buildFixture()

    // Pre-load the counter to one below the limit so we don't pound the
    // gateway 1001 times in a unit test.
    const period = new Date().toISOString().slice(0, 7)
    await fixture.storage.quota.increment(fixture.orgA.id, period, 999)

    const ok = await fixture.app.request('/v1/traces', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${fixture.orgA.publishable}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        publishableKey: fixture.orgA.publishable,
        events: [toolExecuted(fixture.orgA.siteId, 1000)],
      }),
    })
    expect(ok.status).toBe(202)

    const denied = await fixture.app.request('/v1/traces', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${fixture.orgA.publishable}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        publishableKey: fixture.orgA.publishable,
        events: [toolExecuted(fixture.orgA.siteId, 1001)],
      }),
    })
    expect(denied.status).toBe(429)
    const body = (await denied.json()) as { error: string; count: number; limit: number }
    expect(body.error).toBe('quota_exceeded')
    expect(body.limit).toBe(1000)
    expect(body.count).toBeGreaterThanOrEqual(1001)
  })

  it('does not count non-billable trace types', async () => {
    const fixture = await buildFixture()
    const event: TraceEvent = {
      id: 'trc_authz',
      siteId: fixture.orgA.siteId,
      sessionId: 'ses_1',
      occurredAt: new Date().toISOString(),
      type: 'authz.evaluated',
      outcome: 'success',
      metadata: {},
    }
    const res = await fixture.app.request('/v1/traces', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${fixture.orgA.publishable}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        publishableKey: fixture.orgA.publishable,
        events: [event],
      }),
    })
    expect(res.status).toBe(202)
    const period = new Date().toISOString().slice(0, 7)
    const counter = await fixture.storage.quota.get(fixture.orgA.id, period)
    expect(counter?.count ?? 0).toBe(0)
  })
})
