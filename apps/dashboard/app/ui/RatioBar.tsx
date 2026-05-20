export interface RatioSegment {
  label: string
  value: number
  color: string
}

/**
 * A single stacked horizontal bar for a 2-4 segment split — design brief
 * 02 §4.4. Renders a legend with counts + percentages below.
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
    return (
      <div style={{ color: 'var(--fg-muted)', fontSize: 13 }}>{emptyLabel}</div>
    )
  }
  const shown = segments.filter((s) => s.value > 0)

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div
        style={{
          display: 'flex',
          height: 12,
          borderRadius: 999,
          overflow: 'hidden',
          background: 'var(--bg-well)',
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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        {segments.map((s) => (
          <span
            key={s.label}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                background: s.color,
                display: 'inline-block',
              }}
            />
            <span style={{ color: 'var(--fg-muted)' }}>{s.label}</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg)' }}>
              {s.value.toLocaleString()} ({Math.round((s.value / total) * 100)}%)
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}
