export interface RatioSegment {
  label: string
  value: number
  color: string
}

/**
 * A single stacked horizontal bar for a 2-4 segment split (allow/deny/review,
 * success/error/blocked). Renders a legend with counts + percentages below.
 */
export const RatioBar = ({
  segments,
  emptyLabel = 'No data in range.',
}: {
  segments: RatioSegment[]
  emptyLabel?: string
}) => {
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  if (total === 0) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{emptyLabel}</div>
  }
  const shown = segments.filter((s) => s.value > 0)

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div
        style={{
          display: 'flex',
          height: 14,
          borderRadius: 5,
          overflow: 'hidden',
          background: 'var(--bg-muted)',
        }}
      >
        {shown.map((s) => (
          <div
            key={s.label}
            title={`${s.label}: ${s.value.toLocaleString()}`}
            style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
        {segments.map((s) => (
          <span
            key={s.label}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
          >
            <span
              style={{ width: 9, height: 9, borderRadius: 2, background: s.color, display: 'inline-block' }}
            />
            <span style={{ color: 'var(--text-muted)' }}>{s.label}</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>
              {s.value.toLocaleString()} ({Math.round((s.value / total) * 100)}%)
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}
