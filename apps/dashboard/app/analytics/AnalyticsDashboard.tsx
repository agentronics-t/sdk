'use client'

import { useState } from 'react'
import type { AnalyticsBundle, AnalyticsRange, Count } from '../../lib/analytics'
import { Card } from '../ui/Card'
import { BarList } from '../ui/BarList'
import { RatioBar } from '../ui/RatioBar'
import { StatTile } from '../ui/StatTile'
import { Sparkline } from '../Sparkline'

type View = 'auth' | 'authz' | 'activity'

const VIEWS: { id: View; label: string }[] = [
  { id: 'auth', label: 'Auth' },
  { id: 'authz', label: 'Authz' },
  { id: 'activity', label: 'Activity' },
]

const segVal = (counts: Count[], label: string): number =>
  counts.find((c) => c.label === label)?.value ?? 0

const pct = (ratio: number): string => `${(ratio * 100).toFixed(1)}%`

const ms = (value: number | null): string => (value === null ? '—' : `${value.toLocaleString()} ms`)

const tileGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
  gap: 12,
}

const cardGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
  gap: 12,
}

export const AnalyticsDashboard = ({
  bundle,
  range,
  truncated,
  unreachable,
}: {
  bundle: AnalyticsBundle
  range: AnalyticsRange
  truncated: boolean
  unreachable: boolean
}) => {
  const [view, setView] = useState<View>('auth')
  const { auth, authz, activity } = bundle

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {unreachable ? (
        <div
          style={{
            padding: '10px 14px',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius)',
            color: 'var(--danger)',
            fontSize: 13,
          }}
        >
          Gateway unreachable — no traces could be loaded for this range.
        </div>
      ) : null}
      {truncated ? (
        <div style={{ color: 'var(--text-faint)', fontSize: 12 }}>
          Showing the most recent 2,000 events — the selected range may extend further.
        </div>
      ) : null}

      {/* view toggle */}
      <div style={{ display: 'flex', gap: 4 }}>
        {VIEWS.map((item) => {
          const active = view === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              style={{
                padding: '6px 16px',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border-strong)'}`,
                borderRadius: 6,
                background: active ? 'var(--accent)' : 'var(--bg-elevated)',
                color: active ? 'var(--accent-on)' : 'var(--text-muted)',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {item.label}
            </button>
          )
        })}
      </div>

      {view === 'auth' ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={tileGrid}>
            <StatTile label="Identity presentations" value={auth.totalPresentations} />
            <StatTile label="Identities cleared" value={auth.totalCleared} />
            <StatTile label="Distinct subjects" value={auth.distinctSubjects} />
            <StatTile label="Distinct protocols" value={auth.distinctProtocols} />
          </div>
          <div style={cardGrid}>
            <Card title="Protocol mix">
              <BarList
                items={auth.byProtocol}
                emptyLabel="No protocol-tagged auth events in range."
                hrefFor={(item) => `/traces?protocol=${encodeURIComponent(item.label)}`}
              />
            </Card>
            <Card title="Verification outcome">
              <RatioBar
                segments={[
                  { label: 'success', value: segVal(auth.byOutcome, 'success'), color: 'var(--success)' },
                  { label: 'error', value: segVal(auth.byOutcome, 'error'), color: 'var(--warning)' },
                  { label: 'blocked', value: segVal(auth.byOutcome, 'blocked'), color: 'var(--danger)' },
                ]}
              />
            </Card>
            <Card title="Trust level">
              <BarList items={auth.byTrust} emptyLabel="No trust levels in range." />
            </Card>
            <Card title="Top subjects">
              <BarList items={auth.topSubjects} emptyLabel="No verified subjects in range." />
            </Card>
          </div>
          <Card title="Identity presentations over time">
            <Sparkline points={auth.overTime} emptyLabel="No auth activity in range." />
          </Card>
        </div>
      ) : null}

      {view === 'authz' ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={tileGrid}>
            <StatTile label="Policy evaluations" value={authz.totalEvaluations} />
            <StatTile
              label="Allow rate"
              value={pct(authz.allowRate)}
              tone={authz.allowRate >= 0.5 ? 'success' : 'default'}
            />
            <StatTile label="Denied" value={authz.denyCount} tone={authz.denyCount > 0 ? 'danger' : 'default'} />
            <StatTile label="Review" value={authz.reviewCount} />
          </div>
          <div style={cardGrid}>
            <Card title="Decisions">
              <RatioBar
                segments={[
                  { label: 'allow', value: authz.allowCount, color: 'var(--success)' },
                  { label: 'deny', value: authz.denyCount, color: 'var(--danger)' },
                  { label: 'review', value: authz.reviewCount, color: 'var(--warning)' },
                ]}
                emptyLabel="No policy evaluations in range."
              />
            </Card>
            <Card title="Top denied tools">
              <BarList
                items={authz.topDeniedTools}
                emptyLabel="No denials in range."
                accent="var(--danger)"
              />
            </Card>
            <Card title="Evaluations by rule">
              <BarList items={authz.byRule} emptyLabel="No policy rules hit in range." />
            </Card>
            <Card title="Allow vs deny over time">
              <div style={{ display: 'grid', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--success)', marginBottom: 2 }}>allow</div>
                  <Sparkline
                    points={authz.allowOverTime}
                    height={48}
                    stroke="var(--success)"
                    fill="rgba(74, 222, 128, 0.18)"
                    emptyLabel="No allows in range."
                  />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--danger)', marginBottom: 2 }}>deny</div>
                  <Sparkline
                    points={authz.denyOverTime}
                    height={48}
                    stroke="var(--danger)"
                    fill="rgba(248, 113, 113, 0.18)"
                    emptyLabel="No denials in range."
                  />
                </div>
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {view === 'activity' ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={tileGrid}>
            <StatTile label="Total events" value={activity.totalEvents} />
            <StatTile
              label="Error rate"
              value={pct(activity.errorRate)}
              tone={activity.errorCount > 0 ? 'danger' : 'success'}
            />
            <StatTile label="Tool exec p50" value={ms(activity.p50DurationMs)} />
            <StatTile label="Tool exec p95" value={ms(activity.p95DurationMs)} />
          </div>
          <div style={cardGrid}>
            <Card title="Events by type">
              <BarList
                items={activity.byType}
                emptyLabel="No events in range."
                hrefFor={(item) => `/traces?type=${encodeURIComponent(item.label)}`}
              />
            </Card>
            <Card title="Agent class">
              <BarList
                items={activity.byAgentClass}
                emptyLabel="No classified agents in range."
                hrefFor={(item) => `/traces?agentClass=${encodeURIComponent(item.label)}`}
              />
            </Card>
            <Card title="Tool execution volume">
              <BarList items={activity.topTools} emptyLabel="No tool executions in range." />
            </Card>
          </div>
          <Card title="Activity timeline">
            <Sparkline points={activity.timeline} emptyLabel="No activity in range." />
          </Card>
        </div>
      ) : null}

      <p style={{ color: 'var(--text-faint)', fontSize: 11, margin: 0 }}>
        Aggregated client-side over the {range} trace window. Bars linking into the
        explorer carry the matching filter.
      </p>
    </div>
  )
}
