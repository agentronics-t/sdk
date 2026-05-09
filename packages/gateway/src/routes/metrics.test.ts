import { describe, expect, it } from 'vitest'
import type { TraceEvent } from '@agentronics/protocol'
import { buildFixture } from '../test/fixtures.js'
import { compactTraces } from '../jobs/traceCompactor.js'

const event = (overrides: Partial<TraceEvent>): TraceEvent => ({
  id: 'trc',
  siteId: 'site-a',
  sessionId: 'ses_1',
  occurredAt: '2026-05-01T00:30:00.000Z',
  type: 'tool.executed',
  outcome: 'success',
  metadata: {},
  ...overrides,
})

describe('GET /v1/metrics', () => {
  it('returns rolled-up totals from the trace_aggregates table after a compactor run', async () => {
    const fixture = await buildFixture()
    await fixture.storage.traces.insert(fixture.orgA.id, [
      event({ id: 'a', type: 'tool.executed' }),
      event({ id: 'b', type: 'tool.executed' }),
      event({ id: 'c', type: 'authz.evaluated' }),
    ])
    await compactTraces({ storage: fixture.storage, hoursBack: 24 * 365 })

    const res = await fixture.app.request('/v1/metrics', {
      headers: { authorization: `Bearer ${fixture.orgA.secret}` },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      total: number
      byType: Record<string, number>
      quota: { count: number; limit: number; remaining: number }
    }
    expect(body.total).toBe(3)
    expect(body.byType['tool.executed']).toBe(2)
    expect(body.byType['authz.evaluated']).toBe(1)
    expect(body.quota.limit).toBe(1000)
  })

  it('rejects publishable keys with 403', async () => {
    const fixture = await buildFixture()
    const res = await fixture.app.request('/v1/metrics', {
      headers: { authorization: `Bearer ${fixture.orgA.publishable}` },
    })
    expect(res.status).toBe(403)
  })

  it('accepts a Clerk session for dashboard reads', async () => {
    const fixture = await buildFixture()
    const res = await fixture.app.request('/v1/metrics', {
      headers: { 'x-clerk-user': fixture.orgA.clerkUserId },
    })
    expect(res.status).toBe(200)
  })
})
