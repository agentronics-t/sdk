import type { ReactNode } from 'react'
import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { source } from '../../lib/source'

/** Copper A mark + wordmark + a small DOCS pill. Mark geometry matches agentronics.dev (Logo.tsx MARK_PATH). */
const NavTitle = () => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
    <svg width={21} height={20} viewBox="0 0 835 800" aria-hidden>
      <path fill="#E8763A" d="M458 0L835 660L317 660L368 570L664 570L458 209L119 800L0 800Z" />
    </svg>
    <span style={{ fontFamily: 'var(--font-display), sans-serif', fontWeight: 700, letterSpacing: '-0.02em' }}>agentronics</span>
    <span
      style={{
        fontSize: 10,
        fontFamily: 'var(--font-mono), monospace',
        letterSpacing: '0.04em',
        color: 'var(--content-muted)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        padding: '1px 5px',
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
