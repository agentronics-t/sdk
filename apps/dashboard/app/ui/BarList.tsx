import Link from 'next/link'
import type { CSSProperties } from 'react'

export interface BarListItem {
  label: string
  value: number
}

/**
 * Labelled horizontal bar list — design brief 02 §4.3. The bar is the row
 * background (a gradient cut at the value's share of the max). No chart lib.
 * `hrefFor` makes each row a drill-down link.
 */
export const BarList = ({
  items,
  emptyLabel = 'No data in range.',
  hrefFor,
  max,
}: {
  items: BarListItem[]
  emptyLabel?: string
  hrefFor?: (item: BarListItem) => string | undefined
  /** Retained for API compatibility; the bar fill is always --accent-soft. */
  accent?: string
  max?: number
}) => {
  if (items.length === 0) {
    return (
      <div style={{ color: 'var(--fg-muted)', fontSize: 13 }}>{emptyLabel}</div>
    )
  }
  const ceiling = Math.max(1, max ?? Math.max(...items.map((i) => i.value)))

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {items.map((item, i) => {
        const pct = Math.round((item.value / ceiling) * 100)
        const rowStyle: CSSProperties = {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          height: 32,
          padding: '0 12px',
          borderTop: i === 0 ? 'none' : '1px solid var(--border-faint)',
          background: `linear-gradient(to right, var(--accent-soft) 0 ${pct}%, transparent ${pct}%)`,
        }
        const row = (
          <>
            <span
              title={item.label}
              style={{
                fontSize: 13,
                color: 'var(--fg)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {item.label}
            </span>
            <span
              style={{
                fontSize: 13,
                fontFamily: 'var(--font-mono)',
                color: 'var(--fg)',
                flexShrink: 0,
              }}
            >
              {item.value.toLocaleString()}
            </span>
          </>
        )
        const href = hrefFor?.(item)
        return href ? (
          <Link
            key={item.label}
            href={href}
            style={{ ...rowStyle, textDecoration: 'none', color: 'var(--fg)' }}
          >
            {row}
          </Link>
        ) : (
          <div key={item.label} style={rowStyle}>
            {row}
          </div>
        )
      })}
    </div>
  )
}
