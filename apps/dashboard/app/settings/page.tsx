import { getSession } from '../../lib/auth'
import { gatewayJson } from '../../lib/gateway'
import { Card } from '../ui/Card'
import { scheduleWebhookAction } from './actions'

interface MetricsResponse {
  period: string
  total: number
  quota: { count: number; limit: number; remaining: number }
}

interface WebhookRow {
  id: string
  url: string
  status: 'pending' | 'delivered' | 'failed' | 'dead_letter'
  attempts: number
  scheduledAt: string
  deliveredAt: string | null
  lastError: string | null
}

interface WebhooksResponse {
  deliveries: WebhookRow[]
}

const cell = {
  padding: '6px 8px',
  borderBottom: '1px solid var(--border)',
  fontSize: 12,
  fontFamily: 'var(--font-mono)',
  whiteSpace: 'nowrap' as const,
}

const headerCell = { ...cell, textAlign: 'left' as const, background: 'var(--bg-muted)', fontWeight: 600 }

const ProgressBar = ({ value, max }: { value: number; max: number }) => {
  const pct = Math.min(100, Math.round((value / Math.max(1, max)) * 100))
  return (
    <div
      style={{
        height: 8,
        background: 'var(--bg-muted)',
        borderRadius: 999,
        overflow: 'hidden',
        marginTop: 8,
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: '100%',
          background: pct > 90 ? 'var(--danger)' : 'var(--accent)',
        }}
      />
    </div>
  )
}

export default async function SettingsPage() {
  const session = await getSession()
  const [metrics, webhooks] = await Promise.all([
    gatewayJson<MetricsResponse>('/v1/metrics').catch(() => null),
    gatewayJson<WebhooksResponse>('/v1/webhooks').catch(() => ({ deliveries: [] as WebhookRow[] })),
  ])

  const region = process.env.AGENTRONICS_REGION ?? 'us-east-1'
  const siteId = process.env.AGENTRONICS_SITE_ID ?? 'default'

  return (
    <section style={{ display: 'grid', gap: 16 }}>
      <header>
        <h1 style={{ margin: 0 }}>Settings</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>
          Org: <strong>{session.orgName}</strong> ({session.orgId})
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        <Card title="Site">
          <div>
            <strong>Site ID:</strong> <code>{siteId}</code>
          </div>
          <div style={{ marginTop: 6, color: 'var(--text-muted)' }}>
            Set <code>AGENTRONICS_SITE_ID</code> in the dashboard env to point at a different site.
          </div>
        </Card>
        <Card title="Region">
          <div>
            <strong>{region}</strong>
          </div>
          <div style={{ marginTop: 6, color: 'var(--text-muted)' }}>
            Region pinning lands with the Phase 8 dedicated-tenant deployment. See{' '}
            <a href="https://docs.agentronics.dev/docs/enterprise/deployment-options">
              deployment options
            </a>
            .
          </div>
        </Card>
        <Card title="Quota — this month">
          {metrics ? (
            <>
              <div style={{ fontSize: 24, fontWeight: 600 }}>
                {metrics.quota.count.toLocaleString()} / {metrics.quota.limit.toLocaleString()}
              </div>
              <div style={{ color: 'var(--text-muted)' }}>
                {metrics.quota.remaining.toLocaleString()} governed tool calls remaining
              </div>
              <ProgressBar value={metrics.quota.count} max={metrics.quota.limit} />
            </>
          ) : (
            <div style={{ color: 'var(--text-muted)' }}>Gateway unreachable.</div>
          )}
        </Card>
      </div>

      <Card title="Webhook test">
        <p style={{ marginTop: 0, color: 'var(--text-muted)' }}>
          Schedules a one-shot delivery via <code>POST /v1/webhooks/test</code>. The cron drainer
          (every minute) will attempt the delivery and record the outcome below.
        </p>
        <form action={scheduleWebhookAction} style={{ display: 'flex', gap: 8 }}>
          <input
            name="url"
            type="url"
            required
            placeholder="https://your-host.example/agentronics-hook"
            style={{
              flex: 1,
              padding: '8px 10px',
              border: '1px solid var(--border-strong)',
              borderRadius: 6,
              background: 'var(--bg-elevated)',
              color: 'var(--text)',
            }}
          />
          <button
            type="submit"
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: 6,
              background: 'var(--accent)',
              color: 'var(--accent-on)',
              fontWeight: 600,
            }}
          >
            Schedule
          </button>
        </form>
      </Card>

      <Card title={`${webhooks.deliveries.length} webhook deliveries`}>
        {webhooks.deliveries.length === 0 ? (
          <div style={{ color: 'var(--text-muted)' }}>None scheduled yet.</div>
        ) : (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={headerCell}>scheduled</th>
                <th style={headerCell}>url</th>
                <th style={headerCell}>status</th>
                <th style={headerCell}>attempts</th>
                <th style={headerCell}>last error</th>
              </tr>
            </thead>
            <tbody>
              {webhooks.deliveries.map((row) => (
                <tr key={row.id}>
                  <td style={cell}>{new Date(row.scheduledAt).toLocaleString()}</td>
                  <td style={cell}>{row.url}</td>
                  <td style={cell}>{row.status}</td>
                  <td style={cell}>{row.attempts}</td>
                  <td style={cell}>{row.lastError ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </section>
  )
}
