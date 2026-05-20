/**
 * Compact big-number tile for analytics / overview grids. No Card wrapper —
 * lay these out in a `repeat(auto-fit, minmax(...))` grid directly.
 */
export const StatTile = ({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: string | number
  hint?: string
  tone?: 'default' | 'danger' | 'success'
}) => {
  const valueColor =
    tone === 'danger' ? 'var(--danger)' : tone === 'success' ? 'var(--success)' : 'var(--text)'
  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '0.9rem 1.1rem',
        boxShadow: 'var(--shadow-sm)',
        display: 'grid',
        gap: 2,
      }}
    >
      <div style={{ fontSize: 26, fontWeight: 600, color: valueColor }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</div>
      {hint ? <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{hint}</div> : null}
    </div>
  )
}
