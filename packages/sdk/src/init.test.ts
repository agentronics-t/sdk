import { describe, expect, it } from 'vitest'
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

  it('client.detect() returns null on a clean environment', async () => {
    const client = init({ publishableKey: 'agtx_pk_demo_1234567890' })
    const identity = await client.detect({ webmcp: { pollMs: 0 } })
    expect(identity).toBeNull()
    expect(client.traces().at(-1)?.type).toBe('agent.missed')
  })

  it('client.detect() returns a presented identity when nothing else fires', async () => {
    const client = init({ publishableKey: 'agtx_pk_demo_1234567890' })
    client.presentIdentity({ class: 'screenshot', vendor: 'browser-use', token: 'tok_abcdef12' })
    const identity = await client.detect({ webmcp: { pollMs: 0 } })
    expect(identity?.trust).toBe('declared')
    expect(identity?.vendor).toBe('browser-use')
  })

  it('clearIdentity() removes the staged claim', async () => {
    const client = init({ publishableKey: 'agtx_pk_demo_1234567890' })
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
    expect(identity?.trust).toBe('verified')
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
        detectionVersion: '2026.04',
        signals: {},
      })
    ).resolves.toEqual({ quantity: 1 })
  })

  it('can disable tracing', async () => {
    const client = init({ publishableKey: 'agtx_pk_demo_1234567890', trace: { enabled: false } })
    await client.detect({ webmcp: { pollMs: 0 } })
    client.memory.set('cart', { items: 1 })
    expect(client.traces()).toHaveLength(0)
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
      detectionVersion: '2026.04',
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
