/* Presentational MDX widgets that mirror the dashboard product UI. Server-safe
 * (no client hooks); theme-aware via the brand role tokens defined in theme.css. */
import type { CSSProperties } from 'react'

const card: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--surface)',
  padding: '1rem 1.1rem',
  margin: '1.25rem 0',
}

/** Site-memory AI quality score (0–100) with a band + track, like the dashboard. */
export function ScoreGauge({
  value,
  label = 'Site memory quality',
}: {
  value: number
  label?: string
}) {
  const pct = Math.max(0, Math.min(100, value))
  const band =
    pct >= 75
      ? { label: 'Strong', color: 'var(--success)' }
      : pct >= 50
        ? { label: 'Adequate', color: 'var(--warning)' }
        : { label: 'Thin', color: 'var(--danger)' }
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem' }}>
        <span
          style={{
            fontSize: '2.4rem',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            color: band.color,
            lineHeight: 1,
          }}
        >
          {pct}
        </span>
        <span style={{ color: 'var(--content-muted)', fontSize: '0.9rem' }}>/ 100</span>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: '0.74rem',
            fontWeight: 700,
            color: band.color,
            background: `color-mix(in srgb, ${band.color} 14%, transparent)`,
            padding: '3px 10px',
            borderRadius: 'var(--radius-pill)',
          }}
        >
          {band.label}
        </span>
      </div>
      <div
        style={{
          marginTop: '0.7rem',
          height: 8,
          borderRadius: 'var(--radius-pill)',
          background: 'var(--surface-raised)',
          border: '1px solid var(--border)',
          overflow: 'hidden',
        }}
      >
        <div style={{ width: `${pct}%`, height: '100%', background: band.color }} />
      </div>
      <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--content-muted)' }}>
        {label}
      </div>
    </div>
  )
}

/** Completeness checklist — which site-memory factors are present. */
export function CompletenessList({ items }: { items: { label: string; present: boolean }[] }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: '1.25rem 0', display: 'grid', gap: '0.45rem' }}>
      {items.map((it) => (
        <li
          key={it.label}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            fontSize: '0.92rem',
            color: it.present ? 'var(--content)' : 'var(--content-muted)',
          }}
        >
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: 5,
              display: 'grid',
              placeItems: 'center',
              flex: 'none',
              fontSize: 11,
              fontWeight: 800,
              color: it.present ? '#fff' : 'var(--content-muted)',
              background: it.present ? 'var(--success)' : 'var(--surface-raised)',
              border: it.present ? 'none' : '1px solid var(--border-strong)',
            }}
          >
            {it.present ? '✓' : '–'}
          </span>
          {it.label}
        </li>
      ))}
    </ul>
  )
}

/** Tool-management context-fullness bar: how much of an agent's context window
 * the page's tools occupy if they all load (dashboard CONTEXT_BUDGET = 4000). */
export function ContextFullnessBar({
  tokens,
  budget = 4000,
  label,
}: {
  tokens: number
  budget?: number
  label?: string
}) {
  const pct = Math.round((tokens / budget) * 100)
  const color = pct > 100 ? 'var(--danger)' : pct > 75 ? 'var(--warning)' : 'var(--brand)'
  return (
    <div style={card}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '0.75rem',
          fontSize: '0.82rem',
          marginBottom: '0.5rem',
        }}
      >
        <span style={{ color: 'var(--content-secondary)', fontWeight: 600 }}>
          {label ?? 'Context fullness'}
        </span>
        <span style={{ color: 'var(--content-muted)', fontFamily: 'var(--font-mono), monospace' }}>
          {tokens.toLocaleString()} / {budget.toLocaleString()} tokens · {pct}%
        </span>
      </div>
      <div
        style={{
          height: 10,
          borderRadius: 'var(--radius-pill)',
          background: 'var(--surface-raised)',
          border: '1px solid var(--border)',
          overflow: 'hidden',
        }}
      >
        <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color }} />
      </div>
    </div>
  )
}

function SchemaPane({ title, value }: { title: string; value: unknown }) {
  return (
    <div>
      <div
        style={{
          fontSize: '0.68rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--content-muted)',
          fontWeight: 700,
          marginBottom: '0.35rem',
        }}
      >
        {title}
      </div>
      <pre
        style={{
          margin: 0,
          background: 'var(--code-bg)',
          color: 'var(--code-fg)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: '0.7rem 0.85rem',
          fontSize: '0.76rem',
          lineHeight: 1.5,
          fontFamily: 'var(--font-mono), monospace',
          overflowX: 'auto',
        }}
      >
        {JSON.stringify(value ?? {}, null, 2)}
      </pre>
    </div>
  )
}

/** A tool's input/output JSON schema + token cost, like the dashboard tool card. */
export function SchemaBlock({
  name,
  input,
  output,
  tokens,
}: {
  name?: string
  input?: unknown
  output?: unknown
  tokens?: number
}) {
  return (
    <div style={card}>
      {name && (
        <div
          style={{
            fontFamily: 'var(--font-mono), monospace',
            fontWeight: 700,
            marginBottom: '0.7rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          {name}
          {typeof tokens === 'number' && (
            <span
              style={{
                marginLeft: 'auto',
                fontSize: '0.72rem',
                color: 'var(--content-muted)',
                fontFamily: 'var(--font-mono), monospace',
              }}
            >
              ~{tokens} tokens
            </span>
          )}
        </div>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: output != null ? '1fr 1fr' : '1fr',
          gap: '0.75rem',
        }}
      >
        <SchemaPane title="Input" value={input} />
        {output != null && <SchemaPane title="Output" value={output} />}
      </div>
    </div>
  )
}
