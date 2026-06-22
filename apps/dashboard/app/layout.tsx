import type { ReactNode } from 'react'
import { headers } from 'next/headers'
import './globals.css'
import { isClerkConfigured, getSession, type DashboardSession } from '../lib/auth'
import { ClientProviders } from './ClientProviders'
import { UserMenu } from './UserMenu'
import { Icon } from './ui/icons'
import { SidebarNav, type NavGroup } from './SidebarNav'
import { BreadcrumbLabel } from './BreadcrumbLabel'

export const metadata = {
  title: 'Agentronics Dashboard',
  description: 'Configure and observe agent governance for your site.',
  icons: { icon: '/favicon.svg', shortcut: '/favicon.svg', apple: '/favicon.svg' },
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Workspace',
    items: [
      { href: '/', label: 'Overview', icon: 'overview' },
      { href: '/live', label: 'Live', icon: 'live' },
      { href: '/analytics', label: 'Analytics', icon: 'analytics' },
      { href: '/traces', label: 'Traces', icon: 'traces' },
      { href: '/webmcp-tools', label: 'Tool management', icon: 'tools' },
      { href: '/site-memory', label: 'Site memory', icon: 'docs' },
      { href: '/sites', label: 'Sites', icon: 'sites' },
      { href: '/api-keys', label: 'API keys', icon: 'keys' },
    ],
  },
  {
    title: 'Settings',
    items: [{ href: '/settings', label: 'Settings', icon: 'settings' }],
  },
]

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items)
const AUTH_PATH_PREFIXES = ['/sign-in', '/sign-up', '/onboarding']

const isAuthRoute = (pathname: string): boolean =>
  AUTH_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))

/** The Agentronics logomark — the geometric indigo "A" (public/favicon.svg). */
const BrandMark = ({ size = 22 }: { size?: number }) => (
  <img
    src="/favicon.svg"
    alt=""
    aria-hidden="true"
    width={size}
    height={size}
    style={{ borderRadius: 5, flexShrink: 0 }}
  />
)

const Sidebar = ({ session }: { session: DashboardSession }) => (
  <aside
    style={{
      width: 220,
      flexShrink: 0,
      borderRight: '1px solid var(--border)',
      background: 'var(--bg-elevated)',
      display: 'flex',
      flexDirection: 'column',
      position: 'sticky',
      top: 0,
      height: '100vh',
    }}
  >
    {/* Header — brand + org switcher. */}
    <div style={{ padding: '18px 12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0 4px' }}>
        <BrandMark />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: '0.04em',
            color: 'var(--fg)',
          }}
        >
          AGENTRONICS
        </span>
      </div>
      <div
        style={{
          marginTop: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 36,
          padding: '0 10px',
          background: 'var(--bg-well)',
          border: '1px solid var(--border-strong)',
          borderRadius: 6,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 16,
            height: 16,
            borderRadius: 4,
            background: 'var(--accent)',
            color: '#fff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {session.orgName.slice(0, 1).toUpperCase()}
        </span>
        <span
          style={{
            flex: 1,
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--fg)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {session.orgName}
        </span>
        <Icon name="chevrons" size={14} style={{ color: 'var(--fg-muted)' }} />
      </div>
    </div>

    {/* Nav groups. Active state is computed client-side via usePathname so
        client-side <Link> navigation moves the highlight; the root layout
        itself doesn't re-render between segments. */}
    <SidebarNav groups={NAV_GROUPS} />

    {/* User row. */}
    <div
      style={{
        borderTop: '1px solid var(--border)',
        padding: '10px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 9,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--accent), #4338ca)',
          color: '#fff',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        {session.email.slice(0, 2).toUpperCase()}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 12,
            color: 'var(--fg)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {session.email}
        </div>
        <div style={{ fontSize: 11, color: 'var(--fg-faint)' }}>
          {session.orgName}
        </div>
      </div>
    </div>
  </aside>
)

const DashboardChrome = ({
  children,
  session,
  clerkEnabled,
}: {
  children: ReactNode
  session: DashboardSession
  clerkEnabled: boolean
}) => (
  <div style={{ display: 'flex', minHeight: '100vh' }}>
    <Sidebar session={session} />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <header
        style={{
          height: 44,
          flexShrink: 0,
          padding: '0 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-elevated)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <nav
          aria-label="Breadcrumb"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            color: 'var(--fg-muted)',
          }}
        >
          <span>{session.orgName}</span>
          <span style={{ color: 'var(--fg-faint)' }}>/</span>
          <span style={{ color: 'var(--fg)' }}>
            <BreadcrumbLabel items={ALL_ITEMS} fallback="Overview" />
          </span>
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <a
            href="https://sdk.agentronics.dev"
            target="_blank"
            rel="noreferrer"
            className="icon-btn"
            aria-label="Documentation"
          >
            <Icon name="docs" size={16} />
          </a>
          {clerkEnabled ? (
            <UserMenu />
          ) : (
            <span
              style={{
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                color: 'var(--fg-faint)',
                border: '1px solid var(--border)',
                borderRadius: 999,
                padding: '2px 8px',
              }}
            >
              DEMO MODE
            </span>
          )}
        </div>
      </header>
      <main style={{ padding: 24, flex: 1, minWidth: 0 }}>{children}</main>
    </div>
  </div>
)

const AuthShell = ({ children }: { children: ReactNode }) => (
  <div
    style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg)',
    }}
  >
    {children}
  </div>
)

export default async function RootLayout({ children }: { children: ReactNode }) {
  const pathname = (await headers()).get('x-pathname') ?? '/'
  const onAuthRoute = isAuthRoute(pathname)
  const session = onAuthRoute ? null : await getSession()

  return (
    <html lang="en">
      <body>
        <ClientProviders clerkEnabled={isClerkConfigured()}>
          {onAuthRoute || !session ? (
            <AuthShell>{children}</AuthShell>
          ) : (
            <DashboardChrome
              session={session}
              clerkEnabled={isClerkConfigured()}
            >
              {children}
            </DashboardChrome>
          )}
        </ClientProviders>
      </body>
    </html>
  )
}
