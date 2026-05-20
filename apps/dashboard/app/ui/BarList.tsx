import Link from 'next/link'

export interface BarListItem {
  label: string
  value: number
}

/**
 * Labelled horizontal bar list — the dashboard's no-dependency replacement for
 * a bar chart. Rows are sorted by the caller. `hrefFor` makes each row a
 * drill-down link (e.g. into the /traces explorer with a filter applied).
 */
export const BarList = ({
  items,
  emptyLabel = 'No data in range.',
  hrefFor,
  accent = 'var(--accent)',
  max,
}: {
  items: BarListItem[]
  emptyLabel?: string
  hrefFor?: (item: BarListItem) => string | undefined
  accent?: string
  max?: number
}) => {
  if (items.length === 0) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{emptyLabel}</div>
  }
  const ceiling = Math.max(1, max ?? Math.max(...items.map((i) => i.value)))

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {items.map((item) => {
        const row = (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(72px, 150px) 1fr auto',
              gap: 10,
              alignItems: 'center',
            }}
          >
            <span
              title={item.label}
              style={{
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {item.label}
            </span>
            <div style={{ background: 'var(--bg-muted)', borderRadius: 4, height: 9 }}>
              <div
                style={{
                  width: `${(item.value / ceiling) * 100}%`,
                  minWidth: item.value > 0 ? 3 : 0,
                  height: 9,
                  background: accent,
                  borderRadius: 4,
                }}
              />
            </div>
            <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
              {item.value.toLocaleString()}
            </span>
          </div>
        )
        const href = hrefFor?.(item)
        return href ? (
          <Link
            key={item.label}
            href={href}
            style={{ textDecoration: 'none', color: 'var(--text)' }}
          >
            {row}
          </Link>
        ) : (
          <div key={item.label}>{row}</div>
        )
      })}
    </div>
  )
}
