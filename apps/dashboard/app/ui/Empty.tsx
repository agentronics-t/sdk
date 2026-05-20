import type { ReactNode } from 'react'
import { Icon, type IconName } from './icons'

/** Empty state — design brief 02 §4.10. Centered icon + title + one sentence. */
export const Empty = ({
  icon = 'inbox',
  title,
  hint,
  action,
}: {
  icon?: IconName
  title: string
  hint?: string
  action?: ReactNode
}) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      padding: '32px 16px',
    }}
  >
    <Icon name={icon} size={40} style={{ color: 'var(--fg-faint)' }} />
    <div
      style={{
        marginTop: 16,
        fontSize: 14,
        fontWeight: 500,
        color: 'var(--fg)',
      }}
    >
      {title}
    </div>
    {hint && (
      <div style={{ marginTop: 6, fontSize: 13, color: 'var(--fg-muted)' }}>
        {hint}
      </div>
    )}
    {action && <div style={{ marginTop: 16 }}>{action}</div>}
  </div>
)
