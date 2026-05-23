'use client'

import { usePathname } from 'next/navigation'
import type { NavItem } from './SidebarNav'

const isActive = (href: string, pathname: string): boolean =>
  href === '/'
    ? pathname === '/'
    : pathname === href || pathname.startsWith(`${href}/`)

export function BreadcrumbLabel({ items, fallback }: { items: NavItem[]; fallback: string }) {
  const pathname = usePathname() ?? '/'
  const match = [...items].reverse().find((i) => isActive(i.href, pathname))
  return <>{match?.label ?? fallback}</>
}
