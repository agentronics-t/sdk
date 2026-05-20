import type { ReactNode } from 'react'

/** Base panel container — design brief 02 §4.1. */
export const Card = ({
  title,
  meta,
  action,
  children,
  padded = true,
}: {
  title?: string
  meta?: ReactNode
  action?: ReactNode
  children: ReactNode
  padded?: boolean
}) => (
  <section
    style={{
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
    }}
  >
    {title !== undefined && (
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 18px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--fg)' }}>
            {title}
          </h2>
          {meta && (
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--fg-faint)',
              }}
            >
              {meta}
            </span>
          )}
        </div>
        {action}
      </header>
    )}
    <div style={{ padding: padded ? '16px 18px' : 0 }}>{children}</div>
  </section>
)
