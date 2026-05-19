import Link from 'next/link'
import { gatewayJson } from '../../lib/gateway'
import { Card } from '../ui/Card'
import { createSiteAction, deleteSiteAction } from './actions'

interface SiteRow {
  id: string
  orgId: string
  name: string
  createdAt: string
}

interface ListResponse {
  sites: SiteRow[]
}

const cell = {
  padding: '8px 10px',
  borderBottom: '1px solid var(--border)',
  fontSize: 13,
  whiteSpace: 'nowrap' as const,
}

const headerCell = {
  ...cell,
  textAlign: 'left' as const,
  background: 'var(--bg-muted)',
  fontWeight: 600,
}

const inputStyle = {
  padding: '6px 8px',
  border: '1px solid var(--border-strong)',
  borderRadius: 6,
  background: 'var(--bg-elevated)',
  color: 'var(--text)',
  fontSize: 13,
  width: '100%',
} as const

export default async function SitesPage() {
  const list = await gatewayJson<ListResponse>('/v1/sites').catch(() => ({ sites: [] as SiteRow[] }))
  const sorted = [...list.sites].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))

  return (
    <section style={{ display: 'grid', gap: 16 }}>
      <header>
        <h1 style={{ margin: 0 }}>Sites</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>
          Each site is a surface (browser app, demo, mobile) that traces are scoped to. Create one
          per environment, then configure auth protocols per‑site under{' '}
          <em>Configure protocols</em>.
        </p>
      </header>

      <Card title="Register a new site">
        <form
          action={createSiteAction}
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(180px, 1fr) minmax(180px, 1fr) auto',
            gap: 10,
            alignItems: 'end',
          }}
        >
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            <span style={{ color: 'var(--text-muted)' }}>Site ID</span>
            <input
              name="siteId"
              type="text"
              required
              placeholder="acme-prod"
              pattern="[A-Za-z0-9._\-]+"
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            <span style={{ color: 'var(--text-muted)' }}>Display name</span>
            <input
              name="name"
              type="text"
              required
              placeholder="Acme Production"
              style={inputStyle}
            />
          </label>
          <button
            type="submit"
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              border: '1px solid var(--accent)',
              background: 'var(--accent)',
              color: 'var(--accent-fg)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Create site
          </button>
        </form>
        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 10 }}>
          The Site ID is what your SDK passes as <code>VITE_AGENTRONICS_SITE_ID</code>. Letters,
          digits, <code>.</code>, <code>_</code>, <code>-</code> only.
        </p>
      </Card>

      <Card title="Your sites">
        {sorted.length === 0 ? (
          <div style={{ color: 'var(--text-muted)' }}>
            No sites yet — create one above to start ingesting traces.
          </div>
        ) : (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={headerCell}>Site ID</th>
                <th style={headerCell}>Name</th>
                <th style={headerCell}>Created</th>
                <th style={headerCell} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((site) => (
                <tr key={site.id}>
                  <td style={cell}>
                    <code>{site.id}</code>
                  </td>
                  <td style={cell}>{site.name}</td>
                  <td style={cell}>{new Date(site.createdAt).toLocaleString()}</td>
                  <td style={{ ...cell, display: 'flex', gap: 8 }}>
                    <Link
                      href={`/sites/${encodeURIComponent(site.id)}`}
                      style={{
                        padding: '4px 10px',
                        border: '1px solid var(--border-strong)',
                        borderRadius: 6,
                        background: 'var(--bg-elevated)',
                        color: 'var(--accent)',
                        textDecoration: 'none',
                        fontSize: 12,
                      }}
                    >
                      Configure protocols
                    </Link>
                    <form action={deleteSiteAction}>
                      <input type="hidden" name="id" value={site.id} />
                      <button
                        type="submit"
                        style={{
                          padding: '4px 10px',
                          border: '1px solid var(--border-strong)',
                          borderRadius: 6,
                          background: 'var(--bg-elevated)',
                          color: 'var(--danger)',
                          cursor: 'pointer',
                          fontSize: 12,
                        }}
                      >
                        Delete
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </section>
  )
}
