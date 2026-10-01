import Link from 'next/link'
import './landing.css'

const PILLARS = [
  { title: 'Web Bot Auth', body: 'Verify cryptographically signed agents — RFC 9421 HTTP message signatures, as used by OpenAI’s ChatGPT agent.', href: '/docs/auth/web-bot-auth' },
  { title: 'Agent API keys', body: 'Issue keys to the agents you and your customers run; verified on every request, hashed at rest.', href: '/docs/auth/api-keys' },
  { title: 'Verified crawlers', body: 'Tell real Googlebot, Bingbot and Applebot from scrapers wearing their user agent.', href: '/docs/auth/verified-crawlers' },
  { title: 'OAuth2 & enterprise identity', body: 'Client-credentials tokens, SSO/OIDC, SPIFFE and mTLS for agents with an identity provider.', href: '/docs/auth/overview' },
  { title: 'Access rules', body: 'Allow or block unverified agents, keep allow and block lists — human traffic is never affected.', href: '/docs/access-rules' },
  { title: 'Auth logs & sessions', body: 'Every sign-in, the method, and why it passed or failed — streamed to the console.', href: '/docs/auth-logs' },
]

export default function HomePage() {
  return (
    <main className="landing">
      <div className="landing-brand">
        <img src="/docs-static/icon.svg" alt="" />
        <span>AGENTRONICS</span>
      </div>
      <header className="landing-hero">
        <span className="landing-eyebrow">Agentronics SDK · v0.6</span>
        <h1>Authentication for AI agents.</h1>
        <p className="landing-lede">
          Verify every agent on your site — signed agents, API agents, crawlers, WebMCP and browser
          agents — with any method, and decide what each one may do.
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
          <code>{`// middleware.ts
import { agentronicsMiddleware } from '@agentronics/sdk/next'

export default agentronicsMiddleware({
  rules: { unverified: 'block' },
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
          <h3>Server + browser</h3>
          <p>Middleware for Next.js, Express and any Fetch runtime; a browser SDK for in-page agents.</p>
        </div>
        <div>
          <h3>Standards-based</h3>
          <p>IETF Web Bot Auth, RFC 9421 signatures, OAuth2, OIDC, SPIFFE and mTLS — no proprietary agent protocol.</p>
        </div>
        <div>
          <h3>Free tier</h3>
          <p>1,000 monthly active agents on Free. Human visitors are always free. No credit card required.</p>
        </div>
      </section>

      <footer className="landing-footer">
        <span>Agentronics · authentication for AI agents.</span>
        <Link href="/docs/reference/changelog">Changelog</Link>
      </footer>
    </main>
  )
}
