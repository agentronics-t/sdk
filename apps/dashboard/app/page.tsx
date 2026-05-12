import Link from 'next/link'
import { requireSession } from '../lib/auth'
import { gatewayJson } from '../lib/gateway'
import { Card } from './ui/Card'
import { Sparkline, type SparklinePoint } from './Sparkline'

interface AggregateRow {
  bucketStart: string
  type: string
  count: number
}

interface MetricsResponse {
  period: string
  total: number
  byType: Record<string, number>
  rows: AggregateRow[]
  quota: { count: number; limit: number; remaining: number }
}

const SPARKLINE_DAYS = 7
const ONE_DAY_MS = 24 * 60 * 60 * 1000

const sevenDayPoints = (rows: AggregateRow[]): SparklinePoint[] => {
  const now = new Date()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const buckets = new Map<number, number>()
  for (let i = SPARKLINE_DAYS - 1; i >= 0; i--) {
    buckets.set(today - i * ONE_DAY_MS, 0)
  }
  for (const row of rows) {
    const ts = Date.parse(row.bucketStart)
    if (Number.isNaN(ts)) continue
    const d = new Date(ts)
    const dayKey = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    if (buckets.has(dayKey)) {
      buckets.set(dayKey, (buckets.get(dayKey) ?? 0) + row.count)
    }
  }
  return [...buckets.entries()].map(([key, value]) => ({
    label: new Date(key).toISOString().slice(5, 10),
    value,
  }))
}

const tryFetchMetrics = async (): Promise<MetricsResponse | null> => {
  try {
    const since = new Date(Date.now() - SPARKLINE_DAYS * ONE_DAY_MS).toISOString()
    return await gatewayJson<MetricsResponse>('/v1/metrics', { query: { since } })
  } catch {
    return null
  }
}

export default async function OverviewPage() {
  const session = await requireSession()
  const metrics = await tryFetchMetrics()

  const sparkPoints = metrics ? sevenDayPoints(metrics.rows ?? []) : []

  return (
    <section style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ margin: 0 }}>Overview</h1>
      <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
        Welcome back. Use the sidebar to manage governance for{' '}
        <strong>{session.orgName}</strong>.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <Card title="This month">
          {metrics ? (
            <>
              <div style={{ fontSize: 28, fontWeight: 600 }}>{metrics.quota.count.toLocaleString()}</div>
              <div style={{ color: 'var(--text-muted)' }}>
                of {metrics.quota.limit.toLocaleString()} governed tool calls
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--text-muted)' }}>Gateway unreachable.</div>
          )}
        </Card>
        <Card title="Total events">
          <div style={{ fontSize: 28, fontWeight: 600 }}>
            {metrics?.total?.toLocaleString() ?? '—'}
          </div>
          <div style={{ color: 'var(--text-muted)' }}>across every type</div>
        </Card>
        <Card title="Period">
          <div style={{ fontSize: 28, fontWeight: 600 }}>{metrics?.period ?? '—'}</div>
          <div style={{ color: 'var(--text-muted)' }}>resets at month rollover</div>
        </Card>
      </div>

      <Card title="Last 7 days">
        <Sparkline points={sparkPoints} emptyLabel="No traces in the last 7 days." />
      </Card>

      <Card title="Quick links">
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 2 }}>
          <li>
            <Link href="/live">Live trace feed</Link> — polling-based, refreshes every 2s.
          </li>
          <li>
            <Link href="/traces">Trace explorer</Link> — filter by class / type / time, cursor pagination.
          </li>
          <li>
            <Link href="/api-keys">API keys</Link> — issue, rotate, revoke. Secret keys shown once.
          </li>
          <li>
            <Link href="/settings">Settings</Link> — siteId, region, webhook config, quota.
          </li>
        </ul>
      </Card>
    </section>
  )
}
