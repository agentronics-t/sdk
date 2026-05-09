'use client'

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

export const LiveFeed = () => {
  const { data, error, isLoading } = useSWR('/api/traces?limit=50', fetcher, {
    refreshInterval: 2000,
  })

  if (error) return <div style={{ color: 'var(--danger)' }}>Feed error: {(error as Error).message}</div>
  if (isLoading) return <div style={{ color: 'var(--text-muted)' }}>Connecting…</div>
  const events = data?.events ?? []

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 720 }}>
        <thead>
          <tr>
            <th style={headerCell}>occurred</th>
            <th style={headerCell}>type</th>
            <th style={headerCell}>tool</th>
            <th style={headerCell}>agent</th>
            <th style={headerCell}>trust</th>
            <th style={headerCell}>outcome</th>
          </tr>
        </thead>
        <tbody>
          {events.length === 0 && (
            <tr>
              <td colSpan={6} style={{ ...cellStyle, color: 'var(--text-muted)' }}>
                No events yet — point an SDK at the gateway.
              </td>
            </tr>
          )}
          {events.map((event) => (
            <tr key={event.id}>
              <td style={cellStyle}>{new Date(event.occurredAt).toLocaleTimeString()}</td>
              <td style={cellStyle}>{event.type}</td>
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
          ))}
        </tbody>
      </table>
    </div>
  )
}
