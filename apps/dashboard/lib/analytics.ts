import 'server-only'
import type { TraceEvent } from '@agentronics/protocol'
import { gatewayJson } from './gateway'

/**
 * v1 analytics is computed client-of-gateway: pull a bounded window of raw
 * traces from `GET /v1/traces` and aggregate here in the server component.
 * No `GET /v1/analytics` endpoint and no JSONB index yet — see
 * mds/plan/20-5-26-work.md §2.1 / §10. The 2000-event cap keeps the fan-out
 * to at most 10 paginated gateway calls per page render.
 */

interface TraceQueryResponse {
  events: TraceEvent[]
  nextCursor: string | null
}

export type AnalyticsRange = '24h' | '7d' | '30d'

export const RANGE_LABELS: Record<AnalyticsRange, string> = {
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
}

const ONE_HOUR = 3_600_000
const ONE_DAY = 86_400_000

const RANGE_MS: Record<AnalyticsRange, number> = {
  '24h': ONE_DAY,
  '7d': 7 * ONE_DAY,
  '30d': 30 * ONE_DAY,
}

const MAX_EVENTS = 2000
const PAGE_LIMIT = 200

export const parseRange = (value: string | undefined): AnalyticsRange =>
  value === '24h' || value === '30d' ? value : '7d'

export interface TraceWindow {
  events: TraceEvent[]
  range: AnalyticsRange
  since: string
  /** true when the MAX_EVENTS cap was hit before the range was exhausted */
  truncated: boolean
  /** true when no gateway call succeeded (gateway down / unauthorized) */
  unreachable: boolean
}

/**
 * Pulls every trace newer than `range` from the gateway, cursor-paginated,
 * capped at MAX_EVENTS. Events are returned newest-first (gateway order).
 */
export const fetchTraceWindow = async (range: AnalyticsRange): Promise<TraceWindow> => {
  const sinceMs = Date.now() - RANGE_MS[range]
  const since = new Date(sinceMs).toISOString()
  const events: TraceEvent[] = []
  let cursor: string | null = null
  let truncated = false
  let anySuccess = false

  const maxPages = Math.ceil(MAX_EVENTS / PAGE_LIMIT)
  for (let page = 0; page < maxPages; page++) {
    const query: Record<string, string | number> = { limit: PAGE_LIMIT, since }
    if (cursor) query.cursor = cursor

    const data = await gatewayJson<TraceQueryResponse>('/v1/traces', { query })
      .then((res) => {
        anySuccess = true
        return res
      })
      .catch(() => null)
    if (!data) break

    let reachedSince = false
    for (const event of data.events) {
      if (Date.parse(event.occurredAt) < sinceMs) {
        reachedSince = true
        break
      }
      events.push(event)
      if (events.length >= MAX_EVENTS) {
        truncated = true
        break
      }
    }
    if (reachedSince || truncated || !data.nextCursor) break
    cursor = data.nextCursor
  }

  return { events, range, since, truncated, unreachable: !anySuccess }
}

// ---- aggregation primitives -------------------------------------------------

export interface Count {
  label: string
  value: number
}

export interface TimeBucket {
  label: string
  value: number
}

const readStr = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined

const countBy = (events: TraceEvent[], key: (event: TraceEvent) => string | undefined): Count[] => {
  const map = new Map<string, number>()
  for (const event of events) {
    const k = key(event)
    if (!k) continue
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
}

const bucketSpec = (range: AnalyticsRange): { count: number; sizeMs: number } => {
  if (range === '24h') return { count: 24, sizeMs: ONE_HOUR }
  if (range === '30d') return { count: 30, sizeMs: ONE_DAY }
  return { count: 7, sizeMs: ONE_DAY }
}

/** Buckets events into a fixed-width time series aligned to the range. */
export const timeSeries = (events: TraceEvent[], range: AnalyticsRange): TimeBucket[] => {
  const { count, sizeMs } = bucketSpec(range)
  const end = Math.floor(Date.now() / sizeMs) * sizeMs + sizeMs
  const start = end - count * sizeMs
  const buckets = new Array<number>(count).fill(0)
  for (const event of events) {
    const t = Date.parse(event.occurredAt)
    if (Number.isNaN(t) || t < start || t >= end) continue
    const idx = Math.floor((t - start) / sizeMs)
    if (idx >= 0 && idx < count) buckets[idx] = (buckets[idx] ?? 0) + 1
  }
  return buckets.map((value, i) => {
    const d = new Date(start + i * sizeMs)
    const label =
      sizeMs === ONE_HOUR
        ? `${String(d.getUTCHours()).padStart(2, '0')}:00`
        : d.toISOString().slice(5, 10)
    return { label, value }
  })
}

const percentile = (sortedAsc: number[], p: number): number | null => {
  if (sortedAsc.length === 0) return null
  const idx = Math.min(sortedAsc.length - 1, Math.floor((p / 100) * sortedAsc.length))
  return sortedAsc[idx] ?? null
}

// ---- view bundles -----------------------------------------------------------

export interface AuthAnalytics {
  totalPresentations: number
  totalCleared: number
  distinctSubjects: number
  distinctProtocols: number
  byProtocol: Count[]
  byOutcome: Count[]
  byTrust: Count[]
  overTime: TimeBucket[]
  topSubjects: Count[]
}

export interface AuthzAnalytics {
  totalEvaluations: number
  allowCount: number
  denyCount: number
  reviewCount: number
  allowRate: number
  topDeniedTools: Count[]
  byRule: Count[]
  allowOverTime: TimeBucket[]
  denyOverTime: TimeBucket[]
}

export interface ActivityAnalytics {
  totalEvents: number
  errorCount: number
  errorRate: number
  p50DurationMs: number | null
  p95DurationMs: number | null
  byType: Count[]
  byAgentClass: Count[]
  topTools: Count[]
  timeline: TimeBucket[]
}

export interface AnalyticsBundle {
  auth: AuthAnalytics
  authz: AuthzAnalytics
  activity: ActivityAnalytics
}

const isAuthEvent = (event: TraceEvent): boolean =>
  event.type.startsWith('auth.') || readStr(event.metadata?.protocol) !== undefined

export const computeAnalytics = (window: TraceWindow): AnalyticsBundle => {
  const { events, range } = window

  // ---- auth ----
  const authEvents = events.filter(isAuthEvent)
  const subjects = new Set(
    authEvents.map((e) => readStr(e.metadata?.subject)).filter((s): s is string => Boolean(s))
  )
  const protocols = new Set(
    authEvents.map((e) => readStr(e.metadata?.protocol)).filter((p): p is string => Boolean(p))
  )
  const auth: AuthAnalytics = {
    totalPresentations: events.filter((e) => e.type === 'auth.identity_presented').length,
    totalCleared: events.filter((e) => e.type === 'auth.identity_cleared').length,
    distinctSubjects: subjects.size,
    distinctProtocols: protocols.size,
    byProtocol: countBy(authEvents, (e) => readStr(e.metadata?.protocol)),
    byOutcome: countBy(authEvents, (e) => e.outcome),
    byTrust: countBy(authEvents, (e) => e.agent?.trust),
    overTime: timeSeries(authEvents, range),
    topSubjects: countBy(authEvents, (e) => readStr(e.metadata?.subject)).slice(0, 8),
  }

  // ---- authz ----
  const authzEvents = events.filter((e) => e.policy !== undefined)
  const allows = authzEvents.filter((e) => e.policy?.decision === 'allow')
  const denies = authzEvents.filter((e) => e.policy?.decision === 'deny')
  const reviews = authzEvents.filter((e) => e.policy?.decision === 'review')
  const authz: AuthzAnalytics = {
    totalEvaluations: authzEvents.length,
    allowCount: allows.length,
    denyCount: denies.length,
    reviewCount: reviews.length,
    allowRate: authzEvents.length === 0 ? 0 : allows.length / authzEvents.length,
    topDeniedTools: countBy(denies, (e) => e.tool).slice(0, 8),
    byRule: countBy(authzEvents, (e) => e.policy?.ruleId ?? '(no rule)').slice(0, 8),
    allowOverTime: timeSeries(allows, range),
    denyOverTime: timeSeries(denies, range),
  }

  // ---- activity ----
  const durations = events
    .filter((e) => e.type === 'tool.executed' && typeof e.durationMs === 'number')
    .map((e) => e.durationMs as number)
    .sort((a, b) => a - b)
  const errorCount = events.filter((e) => e.outcome === 'error').length
  const activity: ActivityAnalytics = {
    totalEvents: events.length,
    errorCount,
    errorRate: events.length === 0 ? 0 : errorCount / events.length,
    p50DurationMs: percentile(durations, 50),
    p95DurationMs: percentile(durations, 95),
    byType: countBy(events, (e) => e.type),
    byAgentClass: countBy(events, (e) => e.agent?.class),
    topTools: countBy(
      events.filter((e) => e.type === 'tool.executed'),
      (e) => e.tool
    ).slice(0, 8),
    timeline: timeSeries(events, range),
  }

  return { auth, authz, activity }
}
