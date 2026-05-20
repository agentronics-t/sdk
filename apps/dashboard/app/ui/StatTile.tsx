import type { ReactNode } from 'react'

/**
 * Big-number tile for analytics / overview grids — design brief 02 §4.2.
 * No Card wrapper; lay these out in a grid directly.
 */
export const StatTile = ({
  label,
  value,
  hint,
  tone = 'default',
  size = 'lg',
  aside,
}: {
  label: string
  value: string | number
  hint?: ReactNode
  tone?: 'default' | 'danger' | 'success'
  /** lg = 36px headline number; sm = 24px (dates, secondary metrics). */
  size?: 'lg' | 'sm'
  /** Optional right-aligned element on the label row (e.g. a sparkline). */
  aside?: ReactNode
}) => {
  const valueColor =
    tone === 'danger'
      ? 'var(--err)'
      : tone === 'success'
        ? 'var(--ok)'
        : 'var(--fg)'
  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--fg-faint)',
          }}
        >
          {label}
        </span>
        {aside}
      </div>
      <div
        style={{
          fontSize: size === 'lg' ? 36 : 24,
          fontWeight: 700,
          lineHeight: 1.05,
          letterSpacing: '-0.02em',
          color: valueColor,
        }}
      >
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      {hint ? (
        <div style={{ fontSize: 12, color: 'var(--fg-faint)' }}>{hint}</div>
      ) : null}
    </div>
  )
}
