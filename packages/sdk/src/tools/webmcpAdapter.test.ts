import { describe, expect, it, vi } from 'vitest'
import { createWebMcpAdapter, type WebMcpProvider } from './webmcpAdapter.js'
import type { GovernedTool } from './registry.js'

const stubTool = (name: string): GovernedTool => ({
  name,
  description: `desc ${name}`,
  inputSchema: { type: 'object' },
  execute: () => ({ ok: true }),
})

const createProvider = () => {
  const revoke = vi.fn()
  const provideContext = vi.fn<WebMcpProvider['provideContext']>(() => ({ revoke }))
  const provider: WebMcpProvider = { provideContext }
  return { provider, provideContext, revoke }
}

describe('webmcp adapter', () => {
  it('publishes tool descriptors through provideContext', async () => {
    const { provider, provideContext } = createProvider()
    const invoke = vi.fn(async () => 'invoked')
    const adapter = createWebMcpAdapter({ provider, invoke })

    const result = adapter.publish([stubTool('a'), stubTool('b')])
    expect(result.revoked).toBe(true)
    expect(provideContext).toHaveBeenCalledTimes(1)

    const calls = provideContext.mock.calls
    const payload = calls[0]?.[0] as
      | { tools: Array<{ name: string; invoke: (i: unknown) => Promise<unknown> }> }
      | undefined
    expect(payload?.tools.map((t) => t.name)).toEqual(['a', 'b'])
    await expect(payload?.tools[0]?.invoke({ foo: 1 })).resolves.toBe('invoked')
    expect(invoke).toHaveBeenCalled()
  })

  it('revokes the previous handle when republishing', () => {
    const { provider, revoke } = createProvider()
    const adapter = createWebMcpAdapter({ provider })
    adapter.publish([stubTool('a')])
    adapter.publish([stubTool('b')])
    expect(revoke).toHaveBeenCalledTimes(1)
  })

  it('reports unavailable when provider is missing', () => {
    const adapter = createWebMcpAdapter({ doc: { defaultView: null } })
    expect(adapter.available()).toBe(false)
    expect(adapter.publish([stubTool('a')])).toEqual({ revoked: false })
  })
})
