import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAgentronics } from '@agentronics/react'
import type { CSSProperties } from 'react'
import type {
  AgentIdentity,
  MemoryEntry,
  PolicyEvaluation,
  PolicyRule,
  SiteMemory,
  TraceEvent,
} from '@agentronics/protocol'
import { createWebMcpContextTool, type GovernedTool } from '@agentronics/sdk'
import { ReactExample } from './ReactExample'

const DEMO_POLICIES: PolicyRule[] = [
  {
    id: 'verified-only-checkout',
    tool: 'cart.checkout',
    minTrust: 'verified',
    allowedClasses: [],
    decision: 'allow',
  },
  {
    id: 'declared-can-browse',
    tool: 'cart.*',
    minTrust: 'declared',
    allowedClasses: [],
    decision: 'allow',
    rateLimit: { max: 3, windowSeconds: 60 },
  },
]

const DEMO_TOOLS: GovernedTool[] = [
  {
    name: 'catalog.search',
    group: 'browse',
    description: 'Search the product catalog.',
    inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
    stage: 'browse',
    authz: { minTrust: 'detected', allowedClasses: [], decision: 'allow' },
    execute: () => ({ ok: true }),
  },
  {
    name: 'catalog.read',
    group: 'browse',
    description: 'Read a single product by id.',
    stage: 'browse',
    authz: { minTrust: 'detected', allowedClasses: [], decision: 'allow' },
    execute: () => ({ ok: true }),
  },
  {
    name: 'cart.add',
    group: 'cart',
    description: 'Add an item to the cart.',
    stage: 'browse',
    authz: { minTrust: 'declared', allowedClasses: [], decision: 'allow' },
    rateLimit: { max: 3, windowSeconds: 60 },
    execute: () => ({ ok: true }),
  },
  {
    name: 'cart.checkout',
    group: 'cart',
    description: 'Complete the purchase.',
    stage: 'checkout',
    authz: { minTrust: 'verified', allowedClasses: [], decision: 'allow' },
    execute: () => ({ ok: true }),
  },
  {
    name: 'orders.list',
    group: 'account',
    description: 'List the user\'s orders.',
    stage: 'checkout',
    authz: { minTrust: 'verified', allowedClasses: [], decision: 'allow' },
    execute: () => ({ ok: true }),
  },
  {
    name: 'account.update',
    group: 'account',
    description: 'Update profile fields.',
    stage: 'checkout',
    authz: { minTrust: 'linked', allowedClasses: [], decision: 'allow' },
    execute: () => ({ ok: true }),
  },
]

const DEMO_SITE_MEMORY: Partial<SiteMemory> = {
  siteMap: {
    pages: [
      { path: '/', name: 'Home', purpose: 'Featured products + search' },
      {
        path: '/cart',
        name: 'Cart',
        purpose: 'Review items',
        availableActions: ['updateQuantity', 'proceedToCheckout'],
      },
      {
        path: '/checkout',
        name: 'Checkout',
        purpose: 'Complete purchase',
        prerequisites: ['Cart must not be empty'],
      },
    ],
    navigation: { flow: 'Home → Cart → Checkout', pattern: 'linear' },
  },
  workflows: {
    purchase: {
      steps: [
        { step: 1, action: 'Add items to cart' },
        { step: 2, action: 'Review cart' },
        { step: 3, action: 'Checkout' },
      ],
      notes: 'User confirmation required at step 3.',
    },
  },
  policies: {
    shipping: 'Free over $50',
    returns: '30-day window, free return shipping',
  },
  uiGuidance: {
    addToCart: { selector: '.add-to-cart-btn', behavior: 'Click to add 1 unit' },
    checkout: { selector: '#proceed-checkout', location: 'Right sidebar of /cart' },
  },
}

const panelStyle = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '1rem',
  background: 'var(--bg-elevated)',
  color: 'var(--text)',
} satisfies CSSProperties

const preStyle = {
  background: 'var(--bg-muted)',
  border: '1px solid var(--border)',
  padding: '0.75rem',
  borderRadius: 8,
  overflowX: 'auto',
  fontSize: 12,
  color: 'var(--text)',
  fontFamily: "'Space Mono', ui-monospace, monospace",
} satisfies CSSProperties

export const App = () => {
  const [view, setView] = useState<'governance' | 'react-hooks'>('governance')
  const client = useAgentronics()
  const [identity, setIdentity] = useState<AgentIdentity | null | 'pending'>('pending')
  const [evaluation, setEvaluation] = useState<PolicyEvaluation | null>(null)
  const [memoryEntries, setMemoryEntries] = useState<MemoryEntry[]>([])
  const [traces, setTraces] = useState<TraceEvent[]>([])
  const [policyText, setPolicyText] = useState(() => JSON.stringify(DEMO_POLICIES, null, 2))
  const [siteMemoryText, setSiteMemoryText] = useState(() =>
    JSON.stringify(DEMO_SITE_MEMORY, null, 2)
  )
  const [siteMemory, setSiteMemory] = useState<SiteMemory>(() => client.siteMemory.snapshot())
  const denials = useMemo(
    () => traces.filter((trace) => trace.outcome === 'blocked' || trace.policy?.decision === 'deny'),
    [traces]
  )

  const refreshTraces = useCallback(() => setTraces(client.traces().slice(-12).reverse()), [client])

  const refreshMemory = useCallback(() => {
    setMemoryEntries([
      ...client.memory.list({ scope: 'session' }),
      ...client.memory.list({ scope: 'user' }),
    ])
  }, [client])

  const refreshSiteMemory = useCallback(
    () => setSiteMemory(client.siteMemory.snapshot()),
    [client]
  )

  const refresh = useCallback(async () => {
    setIdentity('pending')
    const detected = await client.detect({ webmcp: { pollMs: 500 } })
    setIdentity(detected)
    setEvaluation(await client.evaluate('cart.checkout', { identity: detected }))
    refreshMemory()
    refreshSiteMemory()
    refreshTraces()
  }, [client, refreshMemory, refreshSiteMemory, refreshTraces])

  useEffect(() => {
    client.setPolicies(DEMO_POLICIES)
    client.provideSiteMemory(DEMO_SITE_MEMORY)
    const unregisters = DEMO_TOOLS.map((tool) => client.registerTool(tool))
    const enforcer = client.installDomEnforcer()
    const delivery = client.installMemoryDelivery({ metaTags: true, overlay: false })
    refresh()
    const timer = window.setInterval(() => {
      refreshTraces()
      refreshSiteMemory()
    }, 700)
    return () => {
      window.clearInterval(timer)
      enforcer.uninstall()
      delivery.uninstall()
      unregisters.forEach((unregister) => unregister())
    }
  }, [client, refresh, refreshSiteMemory, refreshTraces])

  const handleDeclare = async () => {
    client.presentIdentity({
      class: 'screenshot',
      vendor: 'demo-agent',
      token: 'tok_demo_local_only',
    })
    await refresh()
  }

  const handleBearer = async () => {
    const authed = await client.authenticate({
      bearerToken: 'bearer_demo_local_only',
      vendorHint: 'demo-bearer',
      classHint: 'webmcp',
    })
    setIdentity(authed)
    setEvaluation(await client.evaluate('cart.checkout', { identity: authed }))
    refreshTraces()
  }

  const handleClear = async () => {
    client.clearIdentity()
    await refresh()
  }

  const handleApplyPolicies = async () => {
    const parsed = JSON.parse(policyText) as PolicyRule[]
    client.setPolicies(parsed)
    setEvaluation(await client.evaluate('cart.checkout', { identity: identity === 'pending' ? null : identity }))
    refreshTraces()
  }

  const handleApplySiteMemory = () => {
    const parsed = JSON.parse(siteMemoryText) as Partial<SiteMemory>
    client.provideSiteMemory(parsed)
    refreshSiteMemory()
    refreshTraces()
  }

  const handleProvideForPage = () => {
    client.provideForPage({
      path: '/checkout',
      payload: { currentStep: 'order-review', estimatedTotal: 49.99 },
    })
    refreshSiteMemory()
    refreshTraces()
  }

  const handleSetCart = () => {
    client.memory.set('cart', { items: Math.floor(Math.random() * 5) + 1 }, { scope: 'session' })
    refreshMemory()
    refreshTraces()
  }

  const handleSetPref = () => {
    client.memory.set('theme', 'dark', { scope: 'user', ttlSeconds: 3600 })
    refreshMemory()
    refreshTraces()
  }

  const handleCheckoutClick = () => refreshTraces()

  const webmcpPreview = useMemo(() => {
    const tool = createWebMcpContextTool({ getSnapshot: () => client.siteMemory.snapshot() })
    return tool.invoke({ path: 'workflows.purchase' }).content
  }, [client, siteMemory])

  const surfacedIdentity = identity === 'pending' ? null : identity
  const surfacedDecisions = useMemo(
    () => client.explainSurfacing({ identity: surfacedIdentity }),
    [client, surfacedIdentity, traces]
  )
  const surfacedTools = useMemo(
    () => surfacedDecisions.filter((decision) => decision.visible).map((decision) => decision.tool),
    [surfacedDecisions]
  )
  const tokenBudget = useMemo(
    () => client.estimateTokens({ identity: surfacedIdentity }),
    [client, surfacedIdentity, traces]
  )
  const stage = client.progression?.current() ?? 'n/a'

  const handleAdvanceStage = () => {
    client.notifyToolInvoked('cart.add')
    refreshTraces()
  }
  const handleResetStage = () => {
    client.progression?.reset()
    refreshTraces()
  }

  return (
    <main
      style={{
        maxWidth: 1120,
        margin: '2rem auto',
        padding: '0 1.5rem',
        lineHeight: 1.5,
      }}
    >
      <div className="demo-brand">
        <img src="/logo.jpeg" alt="" />
        <span>AGENTRONICS</span>
      </div>
      <h1>Agentronics Demo</h1>

      <p style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => setView('governance')}
          style={{
            background: view === 'governance' ? 'var(--accent)' : 'var(--bg-elevated)',
            color: view === 'governance' ? 'var(--accent-on)' : 'var(--text)',
            border: '1px solid var(--accent)',
            borderRadius: 8,
            padding: '6px 12px',
            fontWeight: 700,
          }}
        >
          Governance demo
        </button>
        <button
          onClick={() => setView('react-hooks')}
          style={{
            background: view === 'react-hooks' ? 'var(--accent)' : 'var(--bg-elevated)',
            color: view === 'react-hooks' ? 'var(--accent-on)' : 'var(--text)',
            border: '1px solid var(--accent)',
            borderRadius: 8,
            padding: '6px 12px',
            fontWeight: 700,
          }}
        >
          React hooks
        </button>
      </p>

      {view === 'react-hooks' && <ReactExample />}

      {view === 'governance' && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <section style={panelStyle}>
          <h2>Agent Inspector</h2>
          <p>
            <button onClick={handleDeclare} style={{ marginRight: 8 }}>
              Declare screenshot agent
            </button>
            <button onClick={handleBearer} style={{ marginRight: 8 }}>
              Verify bearer agent
            </button>
            <button onClick={handleClear}>Clear</button>
          </p>
          {identity === 'pending' && <p>Detecting...</p>}
          {identity === null && <p>No agent detected.</p>}
          {identity && identity !== 'pending' && <pre style={preStyle}>{JSON.stringify(identity, null, 2)}</pre>}
        </section>

        <section style={panelStyle}>
          <h2>Policy Editor</h2>
          <textarea
            value={policyText}
            onChange={(event) => setPolicyText(event.target.value)}
            rows={12}
            style={{ width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
          />
          <p>
            <button onClick={handleApplyPolicies}>Apply policies</button>
          </p>
          {evaluation && <pre style={preStyle}>{JSON.stringify(evaluation, null, 2)}</pre>}
        </section>

        <section style={panelStyle}>
          <h2>Governed Actions</h2>
          <p>
            <button data-agentronics-tool="cart.checkout" onClick={handleCheckoutClick} style={{ marginRight: 8 }}>
              Checkout
            </button>
            <button onClick={handleSetCart} style={{ marginRight: 8 }}>
              Set cart memory
            </button>
            <button onClick={handleSetPref}>Set user memory</button>
          </p>
          <pre style={preStyle}>{JSON.stringify(memoryEntries, null, 2)}</pre>
        </section>

        <section style={panelStyle}>
          <h2>Site Memory Editor</h2>
          <p style={{ marginTop: 0, color: 'var(--text-muted)' }}>
            Enterprise-provided site context. Delivered to agents via WebMCP tool, &lt;meta&gt; tags,
            an optional overlay, and the well-known endpoint.
          </p>
          <textarea
            value={siteMemoryText}
            onChange={(event) => setSiteMemoryText(event.target.value)}
            rows={14}
            style={{ width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
          />
          <p>
            <button onClick={handleApplySiteMemory} style={{ marginRight: 8 }}>
              Apply site memory
            </button>
            <button onClick={handleProvideForPage}>Provide /checkout context</button>
          </p>
        </section>

        <section style={panelStyle}>
          <h2>Delivery Preview</h2>
          <h3 style={{ fontSize: 13, margin: '0 0 6px' }}>WebMCP getSiteContext (workflows.purchase)</h3>
          <pre style={preStyle}>{JSON.stringify(webmcpPreview, null, 2)}</pre>
          <h3 style={{ fontSize: 13, margin: '12px 0 6px' }}>Active site memory snapshot</h3>
          <pre style={preStyle}>{JSON.stringify(siteMemory, null, 2)}</pre>
        </section>

        <section style={panelStyle}>
          <h2>Tool Inspector</h2>
          <p style={{ marginTop: 0, color: 'var(--text-muted)' }}>
            {DEMO_TOOLS.length} registered tools, {surfacedTools.length} surfaced to the current
            agent. Stage: <strong>{stage}</strong>. Approx tokens: {tokenBudget.total}.
          </p>
          <p>
            <button onClick={handleAdvanceStage} style={{ marginRight: 8 }}>
              Trigger cart.add (advances stage)
            </button>
            <button onClick={handleResetStage}>Reset stage</button>
          </p>
          <pre style={preStyle}>
            {JSON.stringify(
              surfacedDecisions.map((decision) => ({
                name: decision.tool.name,
                group: decision.tool.group,
                stage: decision.tool.stage,
                visible: decision.visible,
                reason: decision.reason,
              })),
              null,
              2
            )}
          </pre>
        </section>

        <section style={panelStyle}>
          <h2>Denial Stream</h2>
          <pre style={preStyle}>{JSON.stringify(denials, null, 2)}</pre>
        </section>

        <section style={{ ...panelStyle, gridColumn: '1 / -1' }}>
          <h2>Live Trace Stream</h2>
          <pre data-testid="trace-stream" style={preStyle}>{JSON.stringify(traces, null, 2)}</pre>
        </section>
      </div>
      )}
    </main>
  )
}
