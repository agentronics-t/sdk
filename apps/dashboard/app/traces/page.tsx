import Link from 'next/link'
import type { TraceEvent } from '@agentronics/protocol'
import { gatewayJson } from '../../lib/gateway'
import { Card } from '../ui/Card'

interface TraceQueryResponse {
  events: TraceEvent[]
  nextCursor: string | null
}

const TYPES = [
  '',
  'agent.detected',
  'agent.missed',
  'auth.identity_presented',
  'auth.identity_cleared',
  'authz.policies_set',
  'authz.evaluated',
  'memory.accessed',
  'memory.updated',
  'tool.registered',
  'tool.executed',
  'tool.surfaced',
  'tool.progressed',
  'sdk.error',
] as const

const CLASSES = ['', 'webmcp', 'dom', 'screenshot'] as const

const PROTOCOLS = [
  '',
  'sso',
  'spiffe',
  'google-agent',
  'mtls',
  'bearer',
  'oauth2',
  'extension',
  'session-link',
  'x-agent-header',
  'detection',
  'declaration',
] as const

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined

const truncate = (value: string, max = 32): string =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value

const cell = {
  padding: '6px 8px',
  borderBottom: '1px solid var(--border)',
  fontSize: 12,
  fontFamily: 'var(--font-mono)',
  whiteSpace: 'nowrap' as const,
}

const headerCell = { ...cell, textAlign: 'left' as const, background: 'var(--bg-muted)', fontWeight: 600 }

interface SearchParams {
  agentClass?: string
  type?: string
  protocol?: string
  since?: string
  until?: string
  cursor?: string
  limit?: string
}

const cleanQuery = (params: SearchParams): Record<string, string | number | undefined> => {
  const out: Record<string, string | number | undefined> = {}
  for (const key of ['agentClass', 'type', 'since', 'until', 'cursor', 'limit'] as const) {
    const value = params[key]
    if (value) out[key] = value
  }
  return out
}

const buildHref = (params: SearchParams, overrides: Partial<SearchParams>): string => {
  const merged: SearchParams = { ...params, ...overrides }
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(merged)) {
    if (value) search.set(key, value)
  }
  const qs = search.toString()
  return qs ? `/traces?${qs}` : '/traces'
}

export default async function TracesPage(props: {
  searchParams: Promise<SearchParams>
}) {
  const params = await props.searchParams
  const data = await gatewayJson<TraceQueryResponse>('/v1/traces', { query: cleanQuery(params) }).catch(
    () => ({ events: [], nextCursor: null })
  )
  // Protocol filter is applied client-side over the returned page — the
  // gateway query layer doesn't index `metadata.protocol` yet (JSONB scan
  // would be slow on big tables; will move server-side once we add a
  // partial index). For 50-200 event pages this is fine.
  const events = params.protocol
    ? data.events.filter((event) => readString(event.metadata?.protocol) === params.protocol)
    : data.events

  return (
    <section style={{ display: 'grid', gap: 16 }}>
      <header>
        <h1 style={{ margin: 0 }}>Traces</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>
          Filter the trace stream. Pagination is cursor-based against{' '}
          <code>GET /v1/traces</code>.
        </p>
      </header>

      <Card title="Filters">
        <form
          method="get"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, alignItems: 'end' }}
        >
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            <span style={{ color: 'var(--text-muted)' }}>Agent class</span>
            <select name="agentClass" defaultValue={params.agentClass ?? ''}>
              {CLASSES.map((value) => (
                <option key={value || 'any'} value={value}>
                  {value || 'any'}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            <span style={{ color: 'var(--text-muted)' }}>Type</span>
            <select name="type" defaultValue={params.type ?? ''}>
              {TYPES.map((value) => (
                <option key={value || 'any'} value={value}>
                  {value || 'any'}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            <span style={{ color: 'var(--text-muted)' }}>Protocol</span>
            <select name="protocol" defaultValue={params.protocol ?? ''}>
              {PROTOCOLS.map((value) => (
                <option key={value || 'any'} value={value}>
                  {value || 'any'}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            <span style={{ color: 'var(--text-muted)' }}>Since (ISO)</span>
            <input name="since" type="text" defaultValue={params.since ?? ''} placeholder="2026-05-01T00:00:00Z" />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            <span style={{ color: 'var(--text-muted)' }}>Until (ISO)</span>
            <input name="until" type="text" defaultValue={params.until ?? ''} placeholder="2026-06-01T00:00:00Z" />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            <span style={{ color: 'var(--text-muted)' }}>Limit</span>
            <input name="limit" type="number" min={1} max={200} defaultValue={params.limit ?? '50'} />
          </label>
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
            Apply
          </button>
        </form>
      </Card>

      <Card title={`${events.length} events${params.protocol ? ` (filtered to ${params.protocol})` : ''}`}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 920 }}>
            <thead>
              <tr>
                <th style={headerCell}>occurred</th>
                <th style={headerCell}>type</th>
                <th style={headerCell}>protocol</th>
                <th style={headerCell}>subject</th>
                <th style={headerCell}>tool</th>
                <th style={headerCell}>agent</th>
                <th style={headerCell}>trust</th>
                <th style={headerCell}>outcome</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ ...cell, color: 'var(--text-muted)' }}>
                    No matching events.
                  </td>
                </tr>
              )}
              {events.map((event) => {
                const eventProtocol = readString(event.metadata?.protocol)
                const eventSubject = readString(event.metadata?.subject)
                return (
                  <tr key={event.id}>
                    <td style={cell}>{new Date(event.occurredAt).toISOString()}</td>
                    <td style={cell}>{event.type}</td>
                    <td style={cell}>{eventProtocol ?? '—'}</td>
                    <td style={cell} title={eventSubject ?? undefined}>
                      {eventSubject ? truncate(eventSubject) : '—'}
                    </td>
                    <td style={cell}>{event.tool ?? '—'}</td>
                    <td style={cell}>{event.agent?.class ?? '—'}</td>
                    <td style={cell}>{event.agent?.trust ?? '—'}</td>
                    <td style={cell}>{event.outcome}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {data.nextCursor && (
          <div style={{ marginTop: 12 }}>
            <Link href={buildHref(params, { cursor: data.nextCursor })}>Next page →</Link>
          </div>
        )}
      </Card>
    </section>
  )
}
