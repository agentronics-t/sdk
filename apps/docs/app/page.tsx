import Link from 'next/link'
import './landing.css'

const PILLARS = [
  { title: 'Detection', body: 'Identify WebMCP, crawler, DOM, and screenshot agents with a confidence-scored signal stack.', href: '/docs/detection' },
  { title: 'Auth', body: 'Normalize OAuth, sessions, headers, and detection-as-auth into one trust level.', href: '/docs/auth' },
  { title: 'Authorization', body: 'Enterprise policies enforced in the browser, audited in the gateway.', href: '/docs/authorization' },
  { title: 'Site memory', body: 'Serve structured site context to agents instead of letting them screenshot.', href: '/docs/concepts/site-memory' },
  { title: 'Observability', body: 'Every governed action becomes a trace with full agent + authz context.', href: '/docs/observability' },
  { title: 'Tool management', body: 'Surface the right WebMCP tools to the right agents at the right time.', href: '/docs/concepts/tool-management' },
]

export default function HomePage() {
  return (
    <main className="landing">
      <div className="landing-brand">
        <img src="/docs-static/icon.svg" alt="" />
        <span>AGENTRONICS</span>
      </div>
      <header className="landing-hero">
        <span className="landing-eyebrow">Agentronics SDK · v0.1.0</span>
        <h1>Universal governance for agent-surfable websites.</h1>
        <p className="landing-lede">
          One SDK line. Six pillars in v0.1 (payments lands later). Every agent type — WebMCP-native,
          crawler, DOM-based, screenshot-based — detected, authenticated, authorized, and audited.
        </p>
        <div className="landing-actions">
          <Link href="/docs/getting-started" className="landing-cta landing-cta--primary">
            Get started →
          </Link>
          <Link href="/docs/introduction" className="landing-cta">
            Read the introduction
          </Link>
        </div>
        <pre className="landing-snippet">
          <code>{`import { Agentronics } from '@agentronics/sdk'

Agentronics.init({
  siteId: 'shop-acme-com',
  apiKey: 'agtx_pk_live_…',
})`}</code>
        </pre>
      </header>

      <section className="landing-grid">
        {PILLARS.map((pillar) => (
          <Link key={pillar.title} href={pillar.href} className="landing-card">
            <h2>{pillar.title}</h2>
            <p>{pillar.body}</p>
            <span className="landing-card-arrow">→</span>
          </Link>
        ))}
      </section>

      <section className="landing-meta">
        <div>
          <h3>Lite ≤ 8 KB</h3>
          <p>WebMCP-only sites pull a tree-shakeable build with the smallest possible footprint.</p>
        </div>
        <div>
          <h3>Full ≤ 30 KB</h3>
          <p>The complete six-pillar bundle including DOM enforcement and the gateway exporter.</p>
        </div>
        <div>
          <h3>Free tier</h3>
          <p>1,000 governed tool calls per month on the managed gateway. No credit card required.</p>
        </div>
      </section>

      <footer className="landing-footer">
        <span>Agentronics · agent governance, not agent control.</span>
        <Link href="/docs/reference/changelog">Changelog</Link>
      </footer>
    </main>
  )
}
