import type { ReactNode } from 'react'

/**
 * Minimal inline SVG icon set — keeps the dashboard dependency-free (no icon
 * library) while giving the nav and chrome the stroked icons design brief 02
 * calls for. 24x24 viewBox, 1.75 stroke, currentColor.
 */
export type IconName =
  | 'overview'
  | 'live'
  | 'analytics'
  | 'traces'
  | 'tools'
  | 'sites'
  | 'keys'
  | 'settings'
  | 'docs'
  | 'chevrons'
  | 'chevron-right'
  | 'plus'
  | 'external'
  | 'cloud-off'
  | 'inbox'

const PATHS: Record<IconName, ReactNode> = {
  overview: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  live: <path d="M3 12h4l2.5-7 5 14 2.5-7H21" />,
  analytics: (
    <>
      <path d="M3 21h18" />
      <rect x="5" y="11" width="3.5" height="7" rx="1" />
      <rect x="10.5" y="6" width="3.5" height="12" rx="1" />
      <rect x="16" y="14" width="3.5" height="4" rx="1" />
    </>
  ),
  traces: (
    <>
      <path d="M9 6h12M9 12h12M9 18h12" />
      <circle cx="4" cy="6" r="1.4" />
      <circle cx="4" cy="12" r="1.4" />
      <circle cx="4" cy="18" r="1.4" />
    </>
  ),
  tools: (
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  ),
  sites: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18" />
    </>
  ),
  keys: (
    <>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="M10.7 12.3 20 3" />
      <path d="M16 5l3 3M14 7l3 3" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2.4" />
      <circle cx="8" cy="17" r="2.4" />
    </>
  ),
  docs: (
    <>
      <path d="M6.5 3H19a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 18.5v-13A2.5 2.5 0 0 1 6.5 3z" />
      <path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" />
    </>
  ),
  chevrons: <path d="M7 15l5 5 5-5M7 9l5-5 5 5" />,
  'chevron-right': <path d="M9 6l6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  external: <path d="M7 17 17 7M9 7h8v8" />,
  'cloud-off': (
    <>
      <path d="M3 3l18 18" />
      <path d="M5.8 11A5 5 0 0 1 12 6c2.5 0 4.6 1.8 5 4.2A4 4 0 0 1 19 18H8" />
    </>
  ),
  inbox: (
    <>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.5 6h13l3.5 6v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z" />
    </>
  ),
}

export function Icon({
  name,
  size = 16,
  className,
  style,
}: {
  name: IconName
  size?: number
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      {PATHS[name]}
    </svg>
  )
}
