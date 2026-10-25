import type { ReactNode } from 'react'
import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { source } from '../../lib/source'

/** The logo (red A on a lime square) + wordmark + a small DOCS pill. Same geometry as agentronics.dev (Logo.tsx MARK_PATH). */
const NavTitle = () => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
    <svg width={24} height={24} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="#D4FF3A" />
      <path transform="translate(8 8.33) scale(.019162)" fill="#FF4D1F" d="M458 0L835 660L317 660L368 570L664 570L458 209L119 800L0 800Z" />
    </svg>
    <span style={{ fontFamily: 'var(--font-display), sans-serif', fontWeight: 700, letterSpacing: '-0.02em' }}>agentronics</span>
    <span
      style={{
        fontSize: 9.5,
        fontFamily: 'var(--font-mono), monospace',
        letterSpacing: '0.1em',
        color: 'var(--ink)',
        background: 'var(--lime)',
        border: '1.5px solid var(--ink)',
        borderRadius: 999,
        padding: '2px 7px',
      }}
    >
      DOCS
    </span>
  </span>
)

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout tree={source.pageTree} nav={{ title: <NavTitle /> }}>
      {children}
    </DocsLayout>
  )
}
