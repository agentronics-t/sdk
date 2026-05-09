import type { Storage, TraceAggregateRow } from '../storage/types.js'

export interface CompactorOptions {
  storage: Storage
  /** Now reference (test seam). Defaults to `Date.now()`. */
  now?: () => number
  /** How many hours of raw history to scan per run. Default 24. */
  hoursBack?: number
}

export interface CompactorResult {
  buckets: number
  events: number
}

const HOUR_MS = 60 * 60 * 1000

const bucketStart = (occurredAt: string): string => {
  const ms = Date.parse(occurredAt)
  const floored = Math.floor(ms / HOUR_MS) * HOUR_MS
  return new Date(floored).toISOString()
}

/**
 * Walks raw traces from every org and rolls them up into hourly buckets per
 * (org, site, type, outcome). The aggregator is idempotent — adapters merge by
 * composite key so the cron can safely overlap windows.
 */
export const compactTraces = async ({
  storage,
  now = Date.now,
  hoursBack = 24,
}: CompactorOptions): Promise<CompactorResult> => {
  const since = new Date(now() - hoursBack * HOUR_MS).toISOString()
  const orgs = await storage.orgs.list()
  const aggregateRows: TraceAggregateRow[] = []
  let scannedEvents = 0
  for (const org of orgs) {
    const events = await storage.traces.list(org.id, { limit: 100_000 })
    for (const event of events) {
      if (event.occurredAt < since) continue
      scannedEvents += 1
      aggregateRows.push({
        orgId: org.id,
        siteId: event.siteId,
        bucketStart: bucketStart(event.occurredAt),
        type: event.type,
        outcome: event.outcome,
        count: 1,
      })
    }
  }
  if (aggregateRows.length > 0) await storage.aggregates.insert(aggregateRows)
  return { buckets: aggregateRows.length, events: scannedEvents }
}
