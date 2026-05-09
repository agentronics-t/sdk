import type { TraceEvent } from '@agentronics/protocol'
import type { QuotaRepository } from '../storage/types.js'

export const FREE_TIER_LIMIT = 1000

export const currentPeriod = (now: Date = new Date()): string =>
  now.toISOString().slice(0, 7) // 'YYYY-MM'

export const countQuotaEvents = (events: TraceEvent[]): number =>
  events.filter((event) => event.type === 'tool.executed' && event.outcome === 'success').length

export interface QuotaCheckResult {
  ok: boolean
  count: number
  limit: number
  remaining: number
}

/**
 * Enforces the free-tier quota on the supplied trace batch. Increments the
 * counter by the number of governed tool calls that the batch contains. If the
 * post-increment count crosses the limit, returns ok: false (the batch is
 * still recorded — caller decides whether to reject the whole HTTP request).
 */
export const enforceQuota = async (
  quota: QuotaRepository,
  orgId: string,
  events: TraceEvent[],
  now: Date = new Date()
): Promise<QuotaCheckResult> => {
  const period = currentPeriod(now)
  const billable = countQuotaEvents(events)
  if (billable === 0) {
    const counter = (await quota.get(orgId, period)) ?? {
      orgId,
      period,
      count: 0,
      limit: FREE_TIER_LIMIT,
    }
    return {
      ok: counter.count < counter.limit,
      count: counter.count,
      limit: counter.limit,
      remaining: Math.max(0, counter.limit - counter.count),
    }
  }
  const counter = await quota.increment(orgId, period, billable)
  return {
    ok: counter.count <= counter.limit,
    count: counter.count,
    limit: counter.limit,
    remaining: Math.max(0, counter.limit - counter.count),
  }
}
