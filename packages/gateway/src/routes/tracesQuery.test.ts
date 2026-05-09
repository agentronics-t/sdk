import { describe, expect, it } from 'vitest'
import type { TraceEvent } from '@agentronics/protocol'
import { buildFixture } from '../test/fixtures.js'

const trace = (overrides: Partial<TraceEvent>): TraceEvent => ({
  id: 'trc_x',
  siteId: 'site-a',
  sessionId: 'ses_1',
  occurredAt: '2026-05-01T00:00:00.000Z',
  type: 'tool.executed',
  outcome: 'success',
  metadata: {},
  ...overrides,
})

describe('GET /v1/traces (paginated)', () => {
  it('paginates by cursor and supports class + type filters', async () => {
    const fixture = await buildFixture()
    const seed: TraceEvent[] = []
    for (let i = 0; i < 5; i++) {
      seed.push(
        trace({
          id: `trc_${i}`,
          occurredAt: new Date(Date.UTC(2026, 4, 1, 0, i)).toISOString(),
          type: i % 2 === 0 ? 'tool.executed' : 'authz.evaluated',
          agent: i === 0
            ? null
            : {
                class: 'webmcp',
                trust: 'declared',
                confidence: 1,
                vendor: 'demo',
                userAgent: null,
                detectionVersion: '2026.04',
                signals: {},
              },
        })
      )
    }
    await fixture.storage.traces.insert(fixture.orgA.id, seed)

    const firstPage = await fixture.app.request('/v1/traces?limit=2', {
      headers: { authorization: `Bearer ${fixture.orgA.secret}` },
    })
    expect(firstPage.status).toBe(200)
    const firstBody = (await firstPage.json()) as { events: TraceEvent[]; nextCursor: string | null }
    expect(firstBody.events).toHaveLength(2)
    expect(firstBody.nextCursor).toBeTruthy()

    const filtered = await fixture.app.request(
      `/v1/traces?type=tool.executed&agentClass=webmcp&limit=10`,
      { headers: { authorization: `Bearer ${fixture.orgA.secret}` } }
    )
    const filteredBody = (await filtered.json()) as { events: TraceEvent[] }
    for (const event of filteredBody.events) {
      expect(event.type).toBe('tool.executed')
      expect(event.agent?.class).toBe('webmcp')
    }
  })

  it('rejects publishable keys with 403', async () => {
    const fixture = await buildFixture()
    const res = await fixture.app.request('/v1/traces', {
      headers: { authorization: `Bearer ${fixture.orgA.publishable}` },
    })
    expect(res.status).toBe(403)
  })

  it('accepts a Clerk session for dashboard reads', async () => {
    const fixture = await buildFixture()
    const res = await fixture.app.request('/v1/traces?limit=5', {
      headers: { 'x-clerk-user': fixture.orgA.clerkUserId },
    })
    expect(res.status).toBe(200)
  })
})
