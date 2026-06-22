import type { SiteMemory } from '@agentronics/protocol'
import { requireSession } from '../../lib/auth'
import { gatewayJson } from '../../lib/gateway'
import { scoreSiteMemory } from '../../lib/memoryScore'
import { Card } from '../ui/Card'
import { StatTile } from '../ui/StatTile'
import { PageHeader } from '../ui/PageHeader'

interface SiteRow {
  id: string
  name: string
}

const control = {
  padding: '6px 10px',
  border: '1px solid var(--border-strong)',
  borderRadius: 6,
  background: 'var(--bg-elevated)',
  color: 'var(--text)',
  fontSize: 13,
} as const

const pre = {
  margin: 0,
  padding: 12,
  background: 'var(--bg-muted)',
  borderRadius: 8,
  fontSize: 12,
  fontFamily: 'var(--font-mono)',
  overflowX: 'auto' as const,
  whiteSpace: 'pre-wrap' as const,
}

export default async function SiteMemoryPage(props: {
  searchParams: Promise<{ site?: string }>
}) {
  await requireSession()
  const params = await props.searchParams
  const { sites } = await gatewayJson<{ sites: SiteRow[] }>('/v1/sites').catch(() => ({
    sites: [] as SiteRow[],
  }))
  const selected = params.site || sites[0]?.id || ''

  const memory = selected
    ? await gatewayJson<{ memory: SiteMemory }>(`/v1/sites/${encodeURIComponent(selected)}/memory`)
        .then((r) => r.memory)
        .catch(() => null)
    : null

  const scored = memory ? await scoreSiteMemory(memory) : null
  const pageCount = memory?.siteMap?.pages?.length ?? 0
  const workflowCount = Object.keys(memory?.workflows ?? {}).length
  const pageContextCount = Object.keys(memory?.pageContexts ?? {}).length

  return (
    <section style={{ display: 'grid', gap: 16 }}>
      <PageHeader
        title="Site memory"
        sub="The structured context this site hands to AI agents — scored for completeness."
        actions={
          <form method="get" style={{ display: 'flex', gap: 8 }}>
            <select name="site" defaultValue={selected} style={control}>
              {sites.length === 0 && <option value="">No sites</option>}
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              style={{
                padding: '6px 16px',
                border: 'none',
                borderRadius: 6,
                background: 'var(--accent)',
                color: 'var(--accent-on)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              View
            </button>
          </form>
        }
      />

      {!memory ? (
        <Card title="No site memory">
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            This site hasn&apos;t published site memory yet. Call{' '}
            <code>client.provideSiteMemory(...)</code> then{' '}
            <code>client.syncSiteMemory()</code> from the SDK, and it appears here.
          </div>
        </Card>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: 12,
            }}
          >
            <StatTile
              label="Memory score"
              value={`${scored?.score ?? 0}/100`}
              hint={scored?.source === 'ai' ? 'Vertex Gemini' : 'completeness heuristic'}
              tone={(scored?.score ?? 0) >= 70 ? 'success' : (scored?.score ?? 0) >= 40 ? 'default' : 'danger'}
            />
            <StatTile label="Mapped pages" value={pageCount} />
            <StatTile label="Workflows" value={workflowCount} />
            <StatTile label="Per-page contexts" value={pageContextCount} />
          </div>

          <Card title="Completeness">
            <div style={{ display: 'grid', gap: 8 }}>
              {scored?.breakdown.map((b) => (
                <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      flex: 'none',
                      background: b.present ? 'var(--success)' : 'var(--text-faint)',
                    }}
                  />
                  <span style={{ color: b.present ? 'var(--text)' : 'var(--text-muted)' }}>{b.label}</span>
                  <span style={{ marginLeft: 'auto', color: 'var(--text-faint)', fontSize: 12 }}>
                    {b.present ? 'present' : 'missing'}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {scored && scored.suggestions.length > 0 && (
            <Card
              title="Suggestions"
              meta={<span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{scored.source === 'ai' ? 'AI-generated' : 'heuristic'}</span>}
            >
              <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, fontSize: 13 }}>
                {scored.suggestions.map((s, i) => (
                  <li key={i} style={{ color: 'var(--text-muted)' }}>
                    {s}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Snapshot" meta={<span style={{ fontSize: 12, color: 'var(--text-muted)' }}>delivered to agents as JSON / WebMCP</span>}>
            <pre style={pre}>{JSON.stringify(memory, null, 2)}</pre>
          </Card>
        </>
      )}
    </section>
  )
}
