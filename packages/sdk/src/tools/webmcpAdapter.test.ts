import { afterEach, describe, expect, it, vi } from 'vitest'
import { callTool, createWebMcpAdapter, type WebMcpProvider } from './webmcpAdapter.js'
import { __resetWebMcpActivity, lastWebMcpActivity, type ModelContextLike, type ModelContextTool, type RegisterToolOptions } from './modelContext.js'
import type { GovernedTool } from './registry.js'

const stubTool = (name: string, extra: Partial<GovernedTool> = {}): GovernedTool => ({
  name,
  description: `desc ${name}`,
  inputSchema: { type: 'object' },
  execute: () => ({ ok: true }),
  ...extra,
})

/** A ModelContext per the Oct 2026 draft: async registerTool, unregister via signal, events. */
const createModelContext = (opts: { reject?: string[] } = {}) => {
  const registered = new Map<string, { tool: ModelContextTool; options?: RegisterToolOptions }>()
  const target = new EventTarget()
  const context: ModelContextLike = {
    async registerTool(tool, options) {
      if (opts.reject?.includes(tool.name)) throw new DOMException(`Invalid schema for ${tool.name}`, 'TypeError')
      registered.set(tool.name, options ? { tool, options } : { tool })
      options?.signal?.addEventListener('abort', () => registered.delete(tool.name))
    },
    addEventListener: (type, listener) => target.addEventListener(type, listener),
    removeEventListener: (type, listener) => target.removeEventListener(type, listener),
  }
  const fire = (type: string, toolName: string) => target.dispatchEvent(Object.assign(new Event(type), { toolName }))
  return { context, registered, fire }
}

afterEach(() => __resetWebMcpActivity())

describe('webmcp adapter', () => {
  it('registers each tool with document.modelContext and reports it callable', async () => {
    const { context, registered } = createModelContext()
    const invoke = vi.fn(async () => 'invoked')
    const adapter = createWebMcpAdapter({ host: { document: { modelContext: context } }, invoke })

    const result = adapter.publish([
      stubTool('a', { title: 'Tool A', annotations: { readOnlyHint: true } }),
      stubTool('b', { exposedTo: ['https://partner.example'] }),
    ])
    expect(result.revoked).toBe(true)
    await expect(result.registrations).resolves.toEqual([
      { name: 'a', status: 'callable' },
      { name: 'b', status: 'callable' },
    ])
    expect(adapter.source()).toBe('document')
    expect(registered.get('a')?.tool).toMatchObject({ title: 'Tool A', annotations: { readOnlyHint: true } })
    expect(registered.get('b')?.options?.exposedTo).toEqual(['https://partner.example'])

    const signal = new AbortController().signal
    await expect(registered.get('a')!.tool.execute({ foo: 1 }, { signal })).resolves.toBe('invoked')
    expect(invoke).toHaveBeenCalledWith(expect.objectContaining({ name: 'a' }), { foo: 1 }, expect.any(AbortSignal))
  })

  it('reports tools the browser rejects as failed', async () => {
    const { context } = createModelContext({ reject: ['bad'] })
    const adapter = createWebMcpAdapter({ host: { document: { modelContext: context } } })
    const list = await adapter.publish([stubTool('good'), stubTool('bad')]).registrations
    expect(list[0]).toEqual({ name: 'good', status: 'callable' })
    expect(list[1]).toMatchObject({ name: 'bad', status: 'failed' })
    expect(list[1]!.error).toContain('Invalid schema')
    expect(adapter.status()).toEqual(list)
  })

  it('unregisters the previous set (abort signal) when republishing', async () => {
    const { context, registered } = createModelContext()
    const adapter = createWebMcpAdapter({ host: { document: { modelContext: context } } })
    await adapter.publish([stubTool('a')]).registrations
    await adapter.publish([stubTool('b')]).registrations
    expect([...registered.keys()]).toEqual(['b'])
    adapter.revoke()
    expect(registered.size).toBe(0)
  })

  it('falls back to the navigator alias, then to legacy provideContext polyfills', async () => {
    const { context } = createModelContext()
    expect(createWebMcpAdapter({ host: { navigator: { modelContext: context } } }).source()).toBe('navigator')

    const revoke = vi.fn()
    const provideContext = vi.fn<WebMcpProvider['provideContext']>(() => ({ revoke }))
    const legacy = createWebMcpAdapter({ provider: { provideContext } })
    await legacy.publish([stubTool('a')]).registrations
    legacy.publish([stubTool('b')])
    expect(provideContext).toHaveBeenCalledTimes(2)
    expect(revoke).toHaveBeenCalledTimes(1)
  })

  it('records toolactivated / toolcancel events as agent activity', async () => {
    const { context, fire } = createModelContext()
    const adapter = createWebMcpAdapter({ host: { document: { modelContext: context } } })
    await adapter.publish([stubTool('search')]).registrations
    fire('toolactivated', 'search')
    expect(lastWebMcpActivity()).toMatchObject({ type: 'activated', toolName: 'search' })
    fire('toolcancel', 'search')
    expect(lastWebMcpActivity()).toMatchObject({ type: 'cancelled', toolName: 'search' })
  })

  it('reports unavailable when there is no ModelContext', async () => {
    const adapter = createWebMcpAdapter({ host: { document: null, navigator: null } })
    expect(adapter.available()).toBe(false)
    const result = adapter.publish([stubTool('a')])
    expect(result.revoked).toBe(false)
    await expect(result.registrations).resolves.toEqual([])
  })

  it('runs a tool called with only the arguments (no options object), like agent workbenches do', async () => {
    const { context, registered } = createModelContext()
    const invoke = vi.fn(async (_tool: GovernedTool, input: unknown, signal?: AbortSignal) => ({ input, hasSignal: signal instanceof AbortSignal }))
    const adapter = createWebMcpAdapter({ host: { document: { modelContext: context } }, invoke })
    await adapter.publish([stubTool('search_products')]).registrations
    const execute = registered.get('search_products')!.tool.execute as (input: unknown) => Promise<unknown>
    await expect(execute({ q: 'phone' })).resolves.toEqual({ input: { q: 'phone' }, hasSignal: true })
    await expect(execute(undefined)).resolves.toEqual({ input: {}, hasSignal: true })
    await expect(execute('{"q":"tv"}')).resolves.toEqual({ input: { q: 'tv' }, hasSignal: true })
  })

  it('runs legacy provideContext tools through the same safe call', async () => {
    let tools: Array<{ name: string; invoke(input?: unknown): Promise<unknown> }> = []
    const provideContext = vi.fn<WebMcpProvider['provideContext']>((payload) => {
      tools = payload.tools
      return { revoke: () => undefined }
    })
    const adapter = createWebMcpAdapter({ provider: { provideContext }, invoke: async () => { throw new Error('nope') } })
    await adapter.publish([stubTool('a')]).registrations
    await expect(tools[0]!.invoke()).resolves.toEqual({ error: 'nope' })
  })
})

describe('callTool', () => {
  it('answers errors (policy denials, tool bugs) as values the agent can read', async () => {
    await expect(callTool(async () => { throw new Error('This action needs review.') }, {})).resolves.toEqual({ error: 'This action needs review.' })
    await expect(callTool(() => { throw 'plain' }, {})).resolves.toEqual({ error: 'plain' })
  })

  it('rethrows only when the agent itself cancelled', async () => {
    const agent = new AbortController()
    const call = callTool((_input, signal) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))), {}, agent.signal)
    agent.abort()
    await expect(call).rejects.toThrow('aborted')
  })

  it('always returns JSON-safe values', async () => {
    await expect(callTool(async () => undefined, {})).resolves.toEqual({ ok: true })
    await expect(callTool(async () => new Response('{"items":[1]}', { status: 200 }), {})).resolves.toEqual({ items: [1] })
    await expect(callTool(async () => new Response('down', { status: 503 }), {})).resolves.toEqual({ error: 'Request failed (503)', detail: 'down' })
    const circular: Record<string, unknown> = {}
    circular.self = circular
    await expect(callTool(async () => circular, {})).resolves.toBe('[object Object]')
    await expect(callTool(async () => ({ at: 1n }), {})).resolves.toBe('[object Object]')
  })

  it('aborts a call that never finishes and tells the agent', async () => {
    vi.useFakeTimers()
    let aborted = false
    const call = callTool((_input, signal) => {
      signal.addEventListener('abort', () => (aborted = true))
      return new Promise(() => undefined)
    }, {}, undefined, 1000)
    await vi.advanceTimersByTimeAsync(1000)
    await expect(call).resolves.toMatchObject({ error: "The tool didn't finish within 1 s." })
    expect(aborted).toBe(true)
    vi.useRealTimers()
  })
})
