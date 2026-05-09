/**
 * Tiny SSR-friendly sparkline. Renders an SVG polyline + filled area for a
 * series of integer counts. Deliberately no chart library — keeps the
 * dashboard's first-load JS budget unchanged and avoids a client component
 * round-trip on the overview page.
 */
export interface SparklinePoint {
  label: string
  value: number
}

export interface SparklineProps {
  points: SparklinePoint[]
  width?: number
  height?: number
  stroke?: string
  fill?: string
  emptyLabel?: string
}

export const Sparkline = ({
  points,
  width = 320,
  height = 64,
  stroke = 'var(--accent)',
  fill = 'rgba(99, 102, 241, 0.18)',
  emptyLabel = 'No activity yet.',
}: SparklineProps) => {
  if (points.length === 0) {
    return (
      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{emptyLabel}</div>
    )
  }

  const max = Math.max(1, ...points.map((p) => p.value))
  const stepX = points.length > 1 ? width / (points.length - 1) : 0
  const yFor = (v: number) => height - (v / max) * (height - 4) - 2

  const polyline = points
    .map((p, i) => `${(stepX * i).toFixed(2)},${yFor(p.value).toFixed(2)}`)
    .join(' ')
  const area = `0,${height} ${polyline} ${width},${height}`

  return (
    <figure style={{ margin: 0 }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label={`Sparkline over ${points.length} buckets, peak ${max}`}
        preserveAspectRatio="none"
      >
        <polygon points={area} fill={fill} />
        <polyline points={polyline} fill="none" stroke={stroke} strokeWidth={1.5} />
      </svg>
      <figcaption
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 11,
          color: 'var(--text-faint)',
          marginTop: 4,
        }}
      >
        <span>{points[0]?.label}</span>
        <span>peak {max.toLocaleString()}</span>
        <span>{points[points.length - 1]?.label}</span>
      </figcaption>
    </figure>
  )
}
