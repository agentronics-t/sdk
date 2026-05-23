'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon, type IconName } from './ui/icons'

export interface NavItem {
  href: string
  label: string
  icon: IconName
}

export interface NavGroup {
  title: string
  items: NavItem[]
}

const isActive = (href: string, pathname: string): boolean =>
  href === '/'
    ? pathname === '/'
    : pathname === href || pathname.startsWith(`${href}/`)

export function SidebarNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname() ?? '/'
  return (
    <nav style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
      {groups.map((group) => (
        <div key={group.title} style={{ marginBottom: 14 }}>
          <div
            style={{
              padding: '6px 12px',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--fg-faint)',
            }}
          >
            {group.title}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {group.items.map((item) => {
              const active = isActive(item.href, pathname)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="nav-link"
                  data-active={active}
                >
                  <Icon name={item.icon} size={16} />
                  {item.label}
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}
