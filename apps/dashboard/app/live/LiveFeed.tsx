'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import type { TraceEvent } from '@agentronics/protocol'

const fetcher = async (url: string): Promise<{ events: TraceEvent[] }> => {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`feed failed (${res.status})`)
  return res.json() as Promise<{ events: TraceEvent[] }>
}

const cellStyle = {
  padding: '6px 8px',
  borderBottom: '1px solid var(--border)',
  fontSize: 12,
  fontFamily: 'var(--font-mono)',
  whiteSpace: 'nowrap' as const,
}

const headerCell = {
  ...cellStyle,
  textAlign: 'left' as const,
  background: 'var(--bg-muted)',
  fontWeight: 600,
}

const PROTOCOL_OPTIONS = [
  'all',
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

export const LiveFeed = () => {
  const [protocol, setProtocol] = useState<(typeof PROTOCOL_OPTIONS)[number]>('all')
  const { data, error, isLoading } = useSWR('/api/traces?limit=50', fetcher, {
    refreshInterval: 2000,
  })

  const filtered = useMemo(() => {
    const events = data?.events ?? []
    if (protocol === 'all') return events
    return events.filter((event) => readString(event.metadata?.protocol) === protocol)
  }, [data, protocol])

  if (error) return <div style={{ color: 'var(--danger)' }}>Feed error: {(error as Error).message}</div>
  if (isLoading) return <div style={{ color: 'var(--text-muted)' }}>Connecting…</div>

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 12,
          color: 'var(--text-muted)',
        }}
      >
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span>Protocol:</span>
          <select
            value={protocol}
            onChange={(e) => setProtocol(e.target.value as (typeof PROTOCOL_OPTIONS)[number])}
            style={{
              padding: '4px 8px',
              border: '1px solid var(--border-strong)',
              borderRadius: 6,
              background: 'var(--bg-elevated)',
              color: 'var(--text)',
              fontSize: 12,
            }}
          >
            {PROTOCOL_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <span>
          {filtered.length} of {data?.events?.length ?? 0} events
        </span>
      </div>
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
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} style={{ ...cellStyle, color: 'var(--text-muted)' }}>
                  {protocol === 'all'
                    ? 'No events yet — point an SDK at the gateway.'
                    : `No ${protocol} events in the last 50 traces.`}
                </td>
              </tr>
            )}
            {filtered.map((event) => {
              const eventProtocol = readString(event.metadata?.protocol)
              const eventSubject = readString(event.metadata?.subject)
              return (
                <tr key={event.id}>
                  <td style={cellStyle}>{new Date(event.occurredAt).toLocaleTimeString()}</td>
                  <td style={cellStyle}>{event.type}</td>
                  <td style={cellStyle}>
                    {eventProtocol ? (
                      <span
                        style={{
                          padding: '1px 6px',
                          borderRadius: 4,
                          background: 'var(--bg-muted)',
                          fontSize: 11,
                        }}
                      >
                        {eventProtocol}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td
                    style={cellStyle}
                    title={eventSubject ?? undefined}
                  >
                    {eventSubject ? truncate(eventSubject) : '—'}
                  </td>
                  <td style={cellStyle}>{event.tool ?? '—'}</td>
                  <td style={cellStyle}>{event.agent?.class ?? '—'}</td>
                  <td style={cellStyle}>{event.agent?.trust ?? '—'}</td>
                  <td
                    style={{
                      ...cellStyle,
                      color:
                        event.outcome === 'blocked'
                          ? 'var(--danger)'
                          : event.outcome === 'error'
                            ? 'var(--warning)'
                            : 'var(--success)',
                    }}
                  >
                    {event.outcome}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
