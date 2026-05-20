import Link from 'next/link'
import { requireSession } from '../lib/auth'
import { gatewayJson } from '../lib/gateway'
import { Card } from './ui/Card'
import { StatTile } from './ui/StatTile'
import { PageHeader } from './ui/PageHeader'
import { Icon, type IconName } from './ui/icons'
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

const QUICK_LINKS: { href: string; icon: IconName; label: string; desc: string }[] = [
  { href: '/live', icon: 'live', label: 'Live', desc: 'Real-time trace feed, refreshing every 2s.' },
  { href: '/analytics', icon: 'analytics', label: 'Analytics', desc: 'Auth, authz and activity aggregated from traces.' },
  { href: '/traces', icon: 'traces', label: 'Traces', desc: 'Filter by class, type and time. Cursor pagination.' },
  { href: '/webmcp-tools', icon: 'tools', label: 'WebMCP Tools', desc: 'Every page and the tools registered on it.' },
  { href: '/api-keys', icon: 'keys', label: 'API keys', desc: 'Issue, rotate, revoke. Secrets shown once.' },
  { href: '/settings', icon: 'settings', label: 'Settings', desc: 'Site ID, region, webhooks and quota.' },
]

export default async function OverviewPage() {
  const session = await requireSession()
  const metrics = await tryFetchMetrics()
  const sparkPoints = metrics ? sevenDayPoints(metrics.rows ?? []) : []

  return (
    <section style={{ display: 'grid', gap: 16 }}>
      <PageHeader
        title="Overview"
        sub={
          <>
            Governance at a glance for <strong>{session.orgName}</strong>.
          </>
        }
      />

      {/* Stat tiles. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
          gap: 16,
        }}
      >
        <StatTile
          label="This month"
          value={metrics ? metrics.quota.count : '—'}
          hint={
            metrics
              ? `of ${metrics.quota.limit.toLocaleString()} governed tool calls`
              : 'Gateway unreachable.'
          }
          aside={
            sparkPoints.length > 0 ? (
              <div style={{ width: 92 }}>
                <Sparkline points={sparkPoints} width={92} height={28} />
              </div>
            ) : undefined
          }
        />
        <StatTile
          label="Total events"
          value={metrics ? metrics.total : '—'}
          hint="Across every trace type."
        />
        <StatTile
          label="Period"
          value={metrics?.period ?? '—'}
          size="sm"
          hint="Resets at month rollover."
        />
      </div>

      {/* Trace volume + quick links. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 2fr) minmax(240px, 1fr)',
          gap: 16,
        }}
      >
        <Card title="Last 7 days" meta="trace volume">
          {sparkPoints.length > 0 ? (
            <Sparkline points={sparkPoints} height={120} />
          ) : (
            <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>
              No traces in the last 7 days.
            </div>
          )}
        </Card>

        <Card title="Quick links" padded={false}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {QUICK_LINKS.map((link, i) => (
              <Link
                key={link.href}
                href={link.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '11px 18px',
                  borderTop: i === 0 ? 'none' : '1px solid var(--border-faint)',
                  textDecoration: 'none',
                }}
              >
                <Icon
                  name={link.icon}
                  size={16}
                  style={{ color: 'var(--accent-hover)', flexShrink: 0 }}
                />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 13,
                      fontWeight: 500,
                      color: 'var(--fg)',
                    }}
                  >
                    {link.label}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
                    {link.desc}
                  </span>
                </span>
                <Icon
                  name="chevron-right"
                  size={14}
                  style={{ color: 'var(--fg-faint)', flexShrink: 0 }}
                />
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </section>
  )
}
