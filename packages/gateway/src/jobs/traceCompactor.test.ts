import { describe, expect, it } from 'vitest'
import type { TraceEvent } from '@agentronics/protocol'
import { buildFixture } from '../test/fixtures.js'
import { compactTraces } from './traceCompactor.js'

const event = (overrides: Partial<TraceEvent>): TraceEvent => ({
  id: 'trc',
  siteId: 'site-a',
  sessionId: 'ses_1',
  occurredAt: '2026-05-01T01:30:00.000Z',
  type: 'tool.executed',
  outcome: 'success',
  metadata: {},
  ...overrides,
})

describe('compactTraces', () => {
  it('rolls up raw events into hourly buckets per (org, site, type, outcome)', async () => {
    const fixture = await buildFixture()
    const events = [
      event({ id: 'a', occurredAt: '2026-05-01T01:10:00.000Z' }),
      event({ id: 'b', occurredAt: '2026-05-01T01:50:00.000Z' }),
      event({ id: 'c', occurredAt: '2026-05-01T02:05:00.000Z', outcome: 'blocked' }),
    ]
    await fixture.storage.traces.insert(fixture.orgA.id, events)

    const result = await compactTraces({ storage: fixture.storage, hoursBack: 24 * 365 })
    expect(result.events).toBe(3)

    const rows = await fixture.storage.aggregates.query(fixture.orgA.id)
    const hour01 = rows.find((row) => row.bucketStart === '2026-05-01T01:00:00.000Z' && row.outcome === 'success')
    const hour02 = rows.find((row) => row.bucketStart === '2026-05-01T02:00:00.000Z' && row.outcome === 'blocked')
    expect(hour01?.count).toBe(2)
    expect(hour02?.count).toBe(1)
  })

  it('is idempotent — running twice does not double-count', async () => {
    const fixture = await buildFixture()
    await fixture.storage.traces.insert(fixture.orgA.id, [
      event({ id: 'a', occurredAt: '2026-05-01T01:10:00.000Z' }),
      event({ id: 'b', occurredAt: '2026-05-01T01:40:00.000Z' }),
    ])
    await compactTraces({ storage: fixture.storage, hoursBack: 24 * 365 })
    await compactTraces({ storage: fixture.storage, hoursBack: 24 * 365 })
    const rows = await fixture.storage.aggregates.query(fixture.orgA.id)
    // The compactor recomputes full bucket counts and adapters replace the
    // stored value, so overlapping scans converge on the true count.
    const total = rows.reduce((sum, row) => sum + row.count, 0)
    expect(total).toBe(2)
  })
})
