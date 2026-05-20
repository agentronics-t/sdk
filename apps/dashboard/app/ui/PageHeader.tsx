import type { ReactNode } from 'react'

/** Page head — H1 + one-line sub + optional right-aligned actions. Brief 02 §2.3. */
export const PageHeader = ({
  title,
  sub,
  actions,
}: {
  title: string
  sub?: ReactNode
  actions?: ReactNode
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
      marginBottom: 20,
    }}
  >
    <div style={{ minWidth: 0 }}>
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: 'var(--fg)' }}>
        {title}
      </h1>
      {sub && (
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--fg-muted)' }}>
          {sub}
        </p>
      )}
    </div>
    {actions && (
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>{actions}</div>
    )}
  </div>
)
