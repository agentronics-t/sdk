import type { ReactNode } from 'react'
import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { source } from '../../lib/source'

/** Logomark + sentence-case wordmark + a small DOCS pill — design brief 03 §4. */
const NavTitle = () => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
    <img src="/docs-static/favicon.svg" alt="" width={22} height={22} style={{ borderRadius: 5 }} />
    <span style={{ fontWeight: 700 }}>Agentronics</span>
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
