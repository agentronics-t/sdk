/** Trace outcome pill — color + text, never color alone. Design brief 02 §4.8. */
const STYLES: Record<string, { bg: string; border: string; fg: string }> = {
  success: {
    bg: 'rgba(74,222,128,0.10)',
    border: 'rgba(74,222,128,0.32)',
    fg: 'var(--ok)',
  },
  allow: {
    bg: 'rgba(74,222,128,0.10)',
    border: 'rgba(74,222,128,0.32)',
    fg: 'var(--ok)',
  },
  blocked: {
    bg: 'rgba(248,113,113,0.10)',
    border: 'rgba(248,113,113,0.32)',
    fg: 'var(--err)',
  },
  error: {
    bg: 'rgba(248,113,113,0.10)',
    border: 'rgba(248,113,113,0.32)',
    fg: 'var(--err)',
  },
  deny: {
    bg: 'rgba(248,113,113,0.10)',
    border: 'rgba(248,113,113,0.32)',
    fg: 'var(--err)',
  },
  degraded: {
    bg: 'rgba(251,191,36,0.10)',
    border: 'rgba(251,191,36,0.32)',
    fg: 'var(--warn)',
  },
}

const NEUTRAL = {
  bg: 'var(--bg-well)',
  border: 'var(--border)',
  fg: 'var(--fg-muted)',
}

export const OutcomeChip = ({ outcome }: { outcome: string }) => {
  const s = STYLES[outcome.toLowerCase()] ?? NEUTRAL
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 8px',
        borderRadius: 999,
        border: `1px solid ${s.border}`,
        background: s.bg,
        color: s.fg,
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 4,
          height: 4,
          borderRadius: '50%',
          background: s.fg,
        }}
      />
      {outcome}
    </span>
  )
}
