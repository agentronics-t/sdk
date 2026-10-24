import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWebMcpAdapter, type WebMcpProvider } from './webmcpAdapter.js'
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
    expect(invoke).toHaveBeenCalledWith(expect.objectContaining({ name: 'a' }), { foo: 1 }, signal)
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
})
