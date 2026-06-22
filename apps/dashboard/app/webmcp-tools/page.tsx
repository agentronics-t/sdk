import type { ToolDescriptor } from '@agentronics/protocol'
import { requireSession } from '../../lib/auth'
import { gatewayJson } from '../../lib/gateway'
import {
  fetchTraceWindow,
  parseRange,
  RANGE_LABELS,
  type AnalyticsRange,
} from '../../lib/analytics'
import { pagesWithTools, UNKNOWN_PAGE } from '../../lib/webmcpTools'
import { Card } from '../ui/Card'
import { StatTile } from '../ui/StatTile'

interface SiteRow {
  id: string
  orgId: string
  name: string
  createdAt: string
}

const RANGES: AnalyticsRange[] = ['24h', '7d', '30d']

const control = {
  padding: '6px 10px',
  border: '1px solid var(--border-strong)',
  borderRadius: 6,
  background: 'var(--bg-elevated)',
  color: 'var(--text)',
  fontSize: 13,
} as const

const cell = {
  padding: '7px 10px',
  borderBottom: '1px solid var(--border)',
  fontSize: 12,
  fontFamily: 'var(--font-mono)',
  whiteSpace: 'nowrap' as const,
}

const headerCell = {
  ...cell,
  textAlign: 'left' as const,
  background: 'var(--bg-muted)',
  fontWeight: 600,
}

export default async function WebMcpToolsPage(props: {
  searchParams: Promise<{ site?: string; range?: string }>
}) {
  await requireSession()
  const params = await props.searchParams
  const range: AnalyticsRange = params.range ? parseRange(params.range) : '30d'
  const selectedSite = params.site ?? ''

  const [sitesRes, window] = await Promise.all([
    gatewayJson<{ sites: SiteRow[] }>('/v1/sites').catch(() => ({ sites: [] as SiteRow[] })),
    fetchTraceWindow(range),
  ])

  const events = selectedSite
    ? window.events.filter((e) => e.siteId === selectedSite)
    : window.events
  const pages = pagesWithTools(events)

  const totalTools = pages.reduce((sum, p) => sum + p.toolCount, 0)
  const totalExecutions = pages.reduce((sum, p) => sum + p.executions, 0)
  const hasUnknown = pages.some((p) => p.page === UNKNOWN_PAGE)

  // Live registry (pushed by the SDK via client.syncTools) — schemas + token
  // costs the trace stream can't provide. Per-site only.
  const CONTEXT_BUDGET = 4000
  const registry = selectedSite
    ? await gatewayJson<{ tools: ToolDescriptor[] }>(
        `/v1/sites/${encodeURIComponent(selectedSite)}/tools`
      )
        .then((r) => r.tools)
        .catch(() => [] as ToolDescriptor[])
    : []
  const registryByPage = new Map<string, ToolDescriptor[]>()
  for (const t of registry) {
    const key = t.page || 'unattributed'
    registryByPage.set(key, [...(registryByPage.get(key) ?? []), t])
  }

  return (
    <section style={{ display: 'grid', gap: 16 }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>WebMCP Tool Management</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>
            Every page detected in the trace stream and the WebMCP tools registered on
            it. {RANGE_LABELS[range]}.
          </p>
        </div>
        <form method="get" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select name="site" defaultValue={selectedSite} style={control}>
            <option value="">All sites</option>
            {sitesRes.sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
          <select name="range" defaultValue={range} style={control}>
            {RANGES.map((value) => (
              <option key={value} value={value}>
                {RANGE_LABELS[value]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            style={{
              padding: '7px 16px',
              border: 'none',
              borderRadius: 6,
              background: 'var(--accent)',
              color: 'var(--accent-on)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Apply
          </button>
        </form>
      </header>

      {window.unreachable ? (
        <div
          style={{
            padding: '10px 14px',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius)',
            color: 'var(--danger)',
            fontSize: 13,
          }}
        >
          Gateway unreachable — no traces could be loaded.
        </div>
      ) : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: 12,
        }}
      >
        <StatTile label="Pages detected" value={pages.length} />
        <StatTile label="WebMCP tools" value={totalTools} />
        <StatTile label="Tool executions" value={totalExecutions} />
      </div>

      {selectedSite && registry.length > 0 && (
        <div style={{ display: 'grid', gap: 16 }}>
          <h2 style={{ margin: '4px 0 0', fontSize: 16 }}>Registered tools by page</h2>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: 13 }}>
            From the live registry the SDK syncs — input/output schemas, per-tool token
            cost, and how full an agent&apos;s context gets if a page&apos;s tools all load.
          </p>
          {[...registryByPage.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([page, tools]) => {
              const pageTokens = tools.reduce((s, t) => s + t.tokens, 0)
              const pct = Math.min(100, Math.round((pageTokens / CONTEXT_BUDGET) * 100))
              return (
                <Card
                  key={page}
                  title={page}
                  action={
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {tools.length} tool{tools.length === 1 ? '' : 's'} ·{' '}
                      {pageTokens.toLocaleString()} tok
                    </span>
                  }
                >
                  <div style={{ marginBottom: 12 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 12,
                        color: 'var(--text-muted)',
                        marginBottom: 4,
                      }}
                    >
                      <span>Context fullness if this page&apos;s tools load</span>
                      <span>
                        {pageTokens.toLocaleString()} / {CONTEXT_BUDGET.toLocaleString()} tokens ({pct}%)
                      </span>
                    </div>
                    <div style={{ height: 8, borderRadius: 999, background: 'var(--bg-muted)', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: pct >= 80 ? 'var(--danger)' : pct >= 50 ? 'var(--accent)' : 'var(--success)',
                        }}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {tools.map((t) => (
                      <details key={t.name} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}>
                        <summary style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
                          <code style={{ fontWeight: 600 }}>{t.name}</code>
                          {t.group ? <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.group}</span> : null}
                          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>{t.tokens} tok</span>
                        </summary>
                        {t.description ? (
                          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '8px 0' }}>{t.description}</p>
                        ) : null}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          {(['inputSchema', 'outputSchema'] as const).map((field) => (
                            <div key={field}>
                              <div
                                style={{
                                  fontSize: 11,
                                  textTransform: 'uppercase',
                                  letterSpacing: '.05em',
                                  color: 'var(--text-faint)',
                                  marginBottom: 4,
                                }}
                              >
                                {field === 'inputSchema' ? 'input schema' : 'output schema'}
                              </div>
                              <pre
                                style={{
                                  margin: 0,
                                  fontSize: 11,
                                  fontFamily: 'var(--font-mono)',
                                  background: 'var(--bg-muted)',
                                  borderRadius: 6,
                                  padding: 8,
                                  overflowX: 'auto',
                                }}
                              >
                                {t[field] ? JSON.stringify(t[field], null, 2) : '—'}
                              </pre>
                            </div>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                </Card>
              )
            })}
        </div>
      )}

      {selectedSite && registry.length === 0 ? (
        <p style={{ color: 'var(--text-faint)', fontSize: 12, margin: 0 }}>
          No tool registry synced for this site yet. Call <code>client.syncTools()</code> from
          the SDK after registering tools to populate the page-wise view above.
        </p>
      ) : null}

      {pages.length === 0 ? (
        <Card title="No tools observed">
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            No WebMCP tools observed in this range. Register tools via the SDK
            (<code>agentronics.tools.register(...)</code>) and they appear here grouped
            by page. Traces from SDK versions before 0.1.2 carry no page and land under{' '}
            <code>{UNKNOWN_PAGE}</code>.
          </div>
        </Card>
      ) : (
        pages.map((page) => (
          <Card
            key={page.page}
            title={page.page}
            action={
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {page.toolCount} tool{page.toolCount === 1 ? '' : 's'} ·{' '}
                {page.executions.toLocaleString()} exec
              </span>
            }
          >
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 760 }}>
                <thead>
                  <tr>
                    <th style={headerCell}>tool</th>
                    <th style={headerCell}>group</th>
                    <th style={headerCell}>version</th>
                    <th style={headerCell}>stage</th>
                    <th style={headerCell}>state</th>
                    <th style={headerCell}>executions</th>
                    <th style={headerCell}>blocked</th>
                    <th style={headerCell}>last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {page.tools.map((tool) => {
                    const muted = tool.state === 'disabled'
                    return (
                      <tr key={tool.name} style={muted ? { color: 'var(--text-faint)' } : undefined}>
                        <td style={cell}>{tool.name}</td>
                        <td style={cell}>{tool.group ?? '—'}</td>
                        <td style={cell}>{tool.version ?? '—'}</td>
                        <td style={cell}>{tool.stage ?? '—'}</td>
                        <td
                          style={{
                            ...cell,
                            color: muted ? 'var(--text-faint)' : 'var(--success)',
                          }}
                        >
                          {tool.state}
                        </td>
                        <td style={cell}>{tool.executions.toLocaleString()}</td>
                        <td style={{ ...cell, color: tool.blocked > 0 ? 'var(--danger)' : undefined }}>
                          {tool.blocked.toLocaleString()}
                        </td>
                        <td style={cell}>
                          {tool.lastSeen ? new Date(tool.lastSeen).toLocaleString() : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ))
      )}

      {hasUnknown ? (
        <p style={{ color: 'var(--text-faint)', fontSize: 11, margin: 0 }}>
          Tools under <code>{UNKNOWN_PAGE}</code> came from SDK versions before 0.1.2,
          which did not stamp the page path. Upgrade the SDK to attribute them.
        </p>
      ) : null}
    </section>
  )
}
