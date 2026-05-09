import type { ReactNode } from 'react'
import './globals.css'
import { isClerkConfigured, getSession, type DashboardSession } from '../lib/auth'
import { ClientProviders } from './ClientProviders'
import { UserMenu } from './UserMenu'

export const metadata = {
  title: 'Agentronics Dashboard',
  description: 'Configure and observe agent governance for your site.',
  icons: { icon: '/logo.jpeg', shortcut: '/logo.jpeg', apple: '/logo.jpeg' },
}

const navItems: { href: string; label: string }[] = [
  { href: '/', label: 'Overview' },
  { href: '/live', label: 'Live' },
  { href: '/traces', label: 'Traces' },
  { href: '/api-keys', label: 'API keys' },
  { href: '/settings', label: 'Settings' },
]

const DashboardChrome = ({
  children,
  session,
}: {
  children: ReactNode
  session: DashboardSession
}) => (
  <div style={{ display: 'flex', minHeight: '100vh' }}>
    <aside
      style={{
        width: 220,
        borderRight: '1px solid var(--border)',
        padding: '1.5rem 1rem',
        background: 'var(--bg-elevated)',
      }}
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: 15,
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          letterSpacing: '0.04em',
        }}
      >
        <img src="/logo.jpeg" alt="Agentronics" width={28} height={28} style={{ borderRadius: 6 }} />
        <span style={{ color: 'var(--highlight)' }}>AGENTRONICS</span>
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {navItems.map((item) => (
          <a
            key={item.href}
            href={item.href}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              color: 'var(--text)',
              textDecoration: 'none',
            }}
          >
            {item.label}
          </a>
        ))}
      </nav>
    </aside>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          padding: '0.75rem 1.5rem',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-elevated)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{session.orgName}</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', gap: 12, alignItems: 'center' }}>
          <span>{session.email}</span>
          {session.demoMode ? (
            <span
              style={{
                color: 'var(--accent-on)',
                background: 'var(--accent)',
                padding: '2px 8px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 600,
              }}
              title="Set CLERK_SECRET_KEY + NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY to enable real auth"
            >
              demo mode
            </span>
          ) : (
            <UserMenu />
          )}
        </div>
      </header>
      <main style={{ padding: '1.5rem', flex: 1 }}>{children}</main>
    </div>
  </div>
)

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await getSession()
  return (
    <html lang="en">
      <body>
        <ClientProviders clerkEnabled={isClerkConfigured()}>
          <DashboardChrome session={session}>{children}</DashboardChrome>
        </ClientProviders>
      </body>
    </html>
  )
}
