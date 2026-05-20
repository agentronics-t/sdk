import { requireSession } from '../../lib/auth'
import {
  computeAnalytics,
  fetchTraceWindow,
  parseRange,
  RANGE_LABELS,
  type AnalyticsRange,
} from '../../lib/analytics'
import { AnalyticsDashboard } from './AnalyticsDashboard'

const RANGES: AnalyticsRange[] = ['24h', '7d', '30d']

const selectStyle = {
  padding: '6px 10px',
  border: '1px solid var(--border-strong)',
  borderRadius: 6,
  background: 'var(--bg-elevated)',
  color: 'var(--text)',
  fontSize: 13,
}

const buttonStyle = {
  padding: '7px 16px',
  border: 'none',
  borderRadius: 6,
  background: 'var(--accent)',
  color: 'var(--accent-on)',
  fontWeight: 600,
  cursor: 'pointer',
}

export default async function AnalyticsPage(props: {
  searchParams: Promise<{ range?: string }>
}) {
  await requireSession()
  const { range: rawRange } = await props.searchParams
  const range = parseRange(rawRange)
  const window = await fetchTraceWindow(range)
  const bundle = computeAnalytics(window)

  return (
    <section style={{ display: 'grid', gap: 16 }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>Analytics</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>
            Raw traces aggregated into auth, authz and activity views.{' '}
            {RANGE_LABELS[range]} · {window.events.length.toLocaleString()} events.
          </p>
        </div>
        <form method="get" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select name="range" defaultValue={range} style={selectStyle}>
            {RANGES.map((value) => (
              <option key={value} value={value}>
                {RANGE_LABELS[value]}
              </option>
            ))}
          </select>
          <button type="submit" style={buttonStyle}>
            Apply
          </button>
        </form>
      </header>

      <AnalyticsDashboard
        bundle={bundle}
        range={range}
        truncated={window.truncated}
        unreachable={window.unreachable}
      />
    </section>
  )
}
