import { gatewayJson } from '../../lib/gateway'
import { Card } from '../ui/Card'
import { IssueForm } from './IssueForm'
import { revokeKeyAction } from './actions'

interface KeyRow {
  id: string
  scope: 'publishable' | 'secret'
  prefix: string
  label: string
  createdAt: string
  revokedAt: string | null
}

interface ListResponse {
  keys: KeyRow[]
}

const cell = {
  padding: '8px 10px',
  borderBottom: '1px solid var(--border)',
  fontSize: 13,
  whiteSpace: 'nowrap' as const,
}

const headerCell = { ...cell, textAlign: 'left' as const, background: 'var(--bg-muted)', fontWeight: 600 }

export default async function ApiKeysPage() {
  const list = await gatewayJson<ListResponse>('/v1/api-keys').catch(() => ({ keys: [] as KeyRow[] }))
  const sorted = [...list.keys].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))

  return (
    <section style={{ display: 'grid', gap: 16 }}>
      <header>
        <h1 style={{ margin: 0 }}>API keys</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>
          Issue a publishable + secret pair. Publishable keys are safe in browser code. Secret keys
          are server-only — they are shown <strong>once</strong> on creation, then masked forever.
        </p>
      </header>

      <Card title="Issue a new key pair">
        <IssueForm />
      </Card>

      <Card title="Existing keys">
        {sorted.length === 0 ? (
          <div style={{ color: 'var(--text-muted)' }}>No keys yet.</div>
        ) : (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={headerCell}>Label</th>
                <th style={headerCell}>Scope</th>
                <th style={headerCell}>Prefix</th>
                <th style={headerCell}>Created</th>
                <th style={headerCell}>Status</th>
                <th style={headerCell} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((key) => (
                <tr key={key.id}>
                  <td style={cell}>{key.label}</td>
                  <td style={cell}>{key.scope}</td>
                  <td style={cell}>
                    <code>{key.prefix}…</code>
                  </td>
                  <td style={cell}>{new Date(key.createdAt).toLocaleString()}</td>
                  <td style={cell}>
                    {key.revokedAt ? (
                      <span style={{ color: 'var(--danger)' }}>revoked</span>
                    ) : (
                      <span style={{ color: 'var(--success)' }}>active</span>
                    )}
                  </td>
                  <td style={cell}>
                    {!key.revokedAt && (
                      <form action={revokeKeyAction}>
                        <input type="hidden" name="id" value={key.id} />
                        <button
                          type="submit"
                          style={{
                            padding: '4px 10px',
                            border: '1px solid var(--border-strong)',
                            borderRadius: 6,
                            background: 'var(--bg-elevated)',
                            color: 'var(--danger)',
                          }}
                        >
                          Revoke
                        </button>
                      </form>
                    )}
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
