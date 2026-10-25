import { describe, expect, it, vi } from 'vitest'
import { init } from './init.js'

describe('init', () => {
  it('accepts a publishable key', () => {
    const client = init({ publishableKey: 'agtx_pk_demo_1234567890' })
    expect(client.publishableKey).toBe('agtx_pk_demo_1234567890')
    expect(client.gatewayUrl).toMatch(/^https:\/\//)
    expect(typeof client.detect).toBe('function')
    expect(typeof client.presentIdentity).toBe('function')
  })

  it('rejects a secret key passed to the browser', () => {
    expect(() => init({ publishableKey: 'agtx_sk_dangerous_1234567890' })).toThrow(
      /secret key/i
    )
  })

  it('rejects an unknown key shape', () => {
    expect(() => init({ publishableKey: 'nope_1234567890' })).toThrow(/agtx_pk_/)
  })

  it('rejects a custom non-localhost gateway URL', () => {
    expect(() =>
      init({
        publishableKey: 'agtx_pk_demo_1234567890',
        gatewayUrl: 'https://evil.example.com',
      })
    ).toThrow(/does not support custom API URLs/)
  })

  it('rejects a malformed gateway URL', () => {
    expect(() =>
      init({
        publishableKey: 'agtx_pk_demo_1234567890',
        gatewayUrl: 'not a url',
      })
    ).toThrow(/not a valid URL/)
  })

  it('accepts http://localhost for local development', () => {
    const client = init({
      publishableKey: 'agtx_pk_demo_1234567890',
      gatewayUrl: 'http://localhost:8787',
    })
    expect(client.gatewayUrl).toBe('http://localhost:8787')
  })

  it('client.detect() returns null on a clean environment', async () => {
    const client = init({ publishableKey: 'agtx_pk_demo_1234567890', autoDetect: false })
    const identity = await client.detect({ webmcp: { pollMs: 0 } })
    expect(identity).toBeNull()
    expect(client.traces().at(-1)?.type).toBe('agent.missed')
  })

  it('client.detect() returns a presented identity when nothing else fires', async () => {
    const client = init({ publishableKey: 'agtx_pk_demo_1234567890', autoDetect: false })
    client.presentIdentity({ class: 'screenshot', vendor: 'browser-use', token: 'tok_abcdef12' })
    const identity = await client.detect({ webmcp: { pollMs: 0 } })
    expect(identity?.trust).toBe('declared')
    expect(identity?.vendor).toBe('browser-use')
  })

  it('clearIdentity() removes the staged claim', async () => {
    const client = init({ publishableKey: 'agtx_pk_demo_1234567890', autoDetect: false })
    client.presentIdentity({ class: 'dom', vendor: 'acme', token: 'tok_abcdef12' })
    client.clearIdentity()
    expect(client.presentedIdentity()).toBeNull()
    const identity = await client.detect({ webmcp: { pollMs: 0 } })
    expect(identity).toBeNull()
  })

  it('records policy and memory traces', async () => {
    const client = init({
      publishableKey: 'agtx_pk_demo_1234567890',
      siteId: 'demo-site',
      policies: [
        {
          id: 'deny-checkout',
          tool: 'cart.checkout',
          minTrust: 'verified',
          allowedClasses: [],
          decision: 'allow',
        },
      ],
    })

    client.memory.set('cart', { token: 'secret' })
    await client.evaluate('cart.checkout', { identity: null })

    expect(client.siteId).toBe('demo-site')
    expect(client.traces().map((event) => event.type)).toContain('memory.updated')
    const authz = client.traces().find((event) => event.type === 'authz.evaluated')
    expect(authz?.outcome).toBe('blocked')
    expect(authz?.policy?.decision).toBe('deny')
  })

  it('exposes the auth engine through the client', async () => {
    const client = init({ publishableKey: 'agtx_pk_demo_1234567890' })
    const identity = await client.authenticate({ bearerToken: 'bearer_abcdef12' })
    expect(identity?.trust).toBe('declared')
    expect(client.auth.methods()).toContain('bearer')
  })

  it('registers governed tools through the client', async () => {
    const client = init({ publishableKey: 'agtx_pk_demo_1234567890' })
    client.registerTool({
      name: 'cart.add',
      authz: { minTrust: 'detected', allowedClasses: [], decision: 'allow' },
      execute: (input) => ({ quantity: (input as { quantity: number }).quantity }),
    })
    expect(client.listPolicies().some((policy) => policy.id === 'tool:cart.add')).toBe(true)
    await expect(
      client.tools.execute('cart.add', { quantity: 1 }, {
        class: 'dom',
        trust: 'detected',
        confidence: 1,
        vendor: 'test',
        userAgent: null,
        detectionVersion: '0.1.2',
        signals: {},
      })
    ).resolves.toEqual({ quantity: 1 })
  })

  it('can disable tracing', async () => {
    const client = init({
      publishableKey: 'agtx_pk_demo_1234567890',
      trace: { enabled: false },
      autoDetect: false,
    })
    await client.detect({ webmcp: { pollMs: 0 } })
    client.memory.set('cart', { items: 1 })
    expect(client.traces()).toHaveLength(0)
  })

  it('autoDetect populates agentContext on init by default', async () => {
    const client = init({
      publishableKey: 'agtx_pk_demo_1234567890',
      // Use a fast-resolving config so the test doesn't wait for the default
      // 500ms WebMCP poll.
      autoDetect: { webmcp: { pollMs: 0 } },
    })
    await client.ready
    // jsdom doesn't expose navigator.webdriver, so detection should return
    // null — but the trace is emitted, proving the cycle ran.
    expect(client.agentContext.snapshot().source).toBe('detect')
    expect(client.traces().some((t) => t.type === 'agent.missed')).toBe(true)
  })

  it('autoDetect=false skips the boot detection cycle', async () => {
    const client = init({ publishableKey: 'agtx_pk_demo_1234567890', autoDetect: false })
    await client.ready
    expect(client.agentContext.snapshot().source).toBe('initial')
    expect(client.traces().some((t) => t.type === 'agent.detected')).toBe(false)
  })

  it('tools.execute() called without identity uses the agentContext snapshot', async () => {
    const client = init({ publishableKey: 'agtx_pk_demo_1234567890', autoDetect: false })
    client.registerTool({
      name: 'cart.add',
      authz: { minTrust: 'detected', allowedClasses: [], decision: 'allow' },
      execute: () => ({ ok: true }),
    })
    // Simulate detection populating agentContext (what autoDetect does in
    // production when an agent is present).
    client.presentIdentity({ class: 'webmcp', vendor: 'anthropic', token: 'tok_abcdef12' })

    await client.tools.execute('cart.add', {})

    const executed = client.traces().find((t) => t.type === 'tool.executed')
    expect(executed?.agent?.class).toBe('webmcp')
    expect(executed?.agent?.vendor).toBe('anthropic')
  })

  it('explicit null identity overrides the ambient resolver (anonymous call)', async () => {
    const client = init({ publishableKey: 'agtx_pk_demo_1234567890', autoDetect: false })
    // No authz on the tool — every caller (human or agent) is allowed.
    client.registerTool({
      name: 'cart.add',
      execute: () => ({ ok: true }),
    })
    client.presentIdentity({ class: 'webmcp', vendor: 'anthropic', token: 'tok_abcdef12' })

    await client.tools.execute('cart.add', {}, null)

    const executed = client.traces().find((t) => t.type === 'tool.executed')
    expect(executed?.agent).toBeNull()
  })

  it('exposes site memory and emits memory.updated traces on provide', () => {
    const client = init({
      publishableKey: 'agtx_pk_demo_1234567890',
      siteMemory: {
        siteMap: { pages: [{ path: '/', name: 'Home' }] },
      },
    })
    client.provideSiteMemory({
      workflows: { purchase: { steps: [{ step: 1, action: 'add' }] } },
    })
    expect(client.siteMemory.snapshot().workflows.purchase?.steps[0]?.action).toBe('add')
    const traces = client.traces().filter((event) => event.type === 'memory.updated')
    expect(traces.some((event) => event.metadata.kind === 'site')).toBe(true)
  })

  it('surfaces tools by trust level and stage progression', async () => {
    const client = init({
      publishableKey: 'agtx_pk_demo_1234567890',
      progression: {
        initial: 'browse',
        stages: [
          { name: 'browse', transitions: [{ on: 'cart.add', to: 'checkout' }] },
          { name: 'checkout' },
        ],
      },
      tools: [
        {
          name: 'cart.add',
          stage: 'browse',
          authz: { minTrust: 'declared', allowedClasses: [], decision: 'allow' },
          execute: () => ({ ok: true }),
        },
        {
          name: 'cart.checkout',
          stage: 'checkout',
          authz: { minTrust: 'verified', allowedClasses: [], decision: 'allow' },
          execute: () => ({ ok: true }),
        },
      ],
    })

    const declared = {
      class: 'webmcp' as const,
      trust: 'declared' as const,
      confidence: 1,
      vendor: 'demo',
      userAgent: null,
      detectionVersion: '0.1.2',
      signals: {},
    }
    expect(client.surfaceTools({ identity: declared }).map((tool) => tool.name)).toEqual(['cart.add'])

    client.notifyToolInvoked('cart.add')
    expect(client.progression?.current()).toBe('checkout')

    const verified = { ...declared, trust: 'verified' as const }
    expect(client.surfaceTools({ identity: verified }).map((tool) => tool.name)).toContain(
      'cart.checkout'
    )
  })

  it('publishes surfaced tools to a WebMCP provider when available', async () => {
    const captured: { tools: Array<{ name: string }> }[] = []
    const original = (globalThis as { navigator?: unknown }).navigator
    ;(globalThis as { navigator?: unknown }).navigator = {
      modelContext: {
        provideContext: (payload: { tools: Array<{ name: string }> }) => {
          captured.push(payload)
          return { revoke: () => {} }
        },
      },
    }

    try {
      const client = init({
        publishableKey: 'agtx_pk_demo_1234567890',
        tools: [{ name: 'foo', execute: () => null }],
      })
      expect(client.webmcp.available()).toBe(true)
      const result = client.publishToWebMcp()
      expect(result.surfaced).toBe(1)
      expect(captured[0]?.tools.map((t) => t.name)).toEqual(['foo'])
    } finally {
      if (original === undefined) delete (globalThis as { navigator?: unknown }).navigator
      else (globalThis as { navigator?: unknown }).navigator = original
    }
  })

  it('installs and uninstalls memory delivery channels', () => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
    const client = init({
      publishableKey: 'agtx_pk_demo_1234567890',
      siteMemory: { siteMap: { pages: [{ path: '/', name: 'Home' }] } },
    })
    const handle = client.installMemoryDelivery({ metaTags: true, overlay: true })
    expect(document.querySelector('meta[name="agent-context-version"]')).not.toBeNull()
    expect(document.getElementById('agentronics-memory-overlay')).not.toBeNull()
    handle.uninstall()
    expect(document.querySelector('meta[name="agent-context-version"]')).toBeNull()
    expect(document.getElementById('agentronics-memory-overlay')).toBeNull()
  })
})

describe('Agentronics API (replaces the retired gateway)', () => {
  it('calls https://api.agentronics.dev by default and maps the old gateway URL to it', () => {
    expect(init({ publishableKey: 'agtx_pk_demo_1234567890' }).gatewayUrl).toBe('https://api.agentronics.dev')
    expect(init({ publishableKey: 'agtx_pk_demo_1234567890', gatewayUrl: 'https://gateway.agentronics.dev' }).gatewayUrl).toBe('https://api.agentronics.dev')
  })

  it('syncConfig() pulls rules, approved descriptions and site memory with the publishable key', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          policies: [{ id: 'console:1', tool: 'checkout', minTrust: 'verified', allowedClasses: [], decision: 'review' }],
          toolDescriptions: { search: 'Search products.' },
          siteMemory: { siteMap: { pages: [{ path: '/cart', purpose: 'Review the cart' }] } },
        }),
        { status: 200 }
      )
    )
    vi.stubGlobal('fetch', fetchMock)
    try {
      const client = init({ publishableKey: 'agtx_pk_demo_1234567890', siteId: 'shop', autoDetect: false })
      const config = await client.syncConfig()
      const [url, reqInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      expect(url).toBe('https://api.agentronics.dev/v1/pub/sites/shop/config')
      expect((reqInit.headers as Record<string, string>).authorization).toBe('Bearer agtx_pk_demo_1234567890')
      expect(client.listPolicies()[0]).toMatchObject({ tool: 'checkout', decision: 'review' })
      expect(config.toolDescriptions).toEqual({ search: 'Search products.' })
      expect(client.siteMemory.get('siteMap.pages')).toEqual([{ path: '/cart', purpose: 'Review the cart' }])
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe("init compat: '0.6'", () => {
  it('runs review rules without asking and trusts unverified tokens, with a deprecation warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const client = init({
        publishableKey: 'agtx_pk_demo_1234567890',
        autoDetect: false,
        compat: '0.6',
        policies: [{ id: 'r', tool: 'pay', minTrust: 'detected', allowedClasses: [], decision: 'review' }],
        tools: [{ name: 'pay', execute: () => 'paid' }],
      })
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("compat: '0.6' is on"))
      const agent = { class: 'webmcp' as const, trust: 'detected' as const, confidence: 1, vendor: null, userAgent: null, detectionVersion: 't', signals: {} }
      await expect(client.tools.execute('pay', {}, agent)).resolves.toBe('paid')
      expect((await client.authenticate({ bearerToken: 'bearer_abcdef12' }))?.trust).toBe('verified')
    } finally {
      warn.mockRestore()
    }
  })
})
