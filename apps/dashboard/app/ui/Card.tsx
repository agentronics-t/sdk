import type { ReactNode } from 'react'

export const Card = ({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) => (
  <section
    style={{
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '1rem 1.25rem',
      boxShadow: 'var(--shadow-sm)',
      display: 'grid',
      gap: 8,
    }}
  >
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <h2 style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {title}
      </h2>
      {action}
    </header>
    <div>{children}</div>
  </section>
)
