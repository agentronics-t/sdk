import { afterEach, describe, expect, it } from 'vitest'
import { detectWebMcp, webMcpSupport } from './webmcp.js'
import { __resetWebMcpActivity, noteWebMcpActivity } from '../tools/modelContext.js'

const define = (target: object, value: unknown) =>
  Object.defineProperty(target, 'modelContext', { value, configurable: true, writable: true })
const clear = () => {
  delete (navigator as unknown as { modelContext?: unknown }).modelContext
  delete (document as unknown as { modelContext?: unknown }).modelContext
}

describe('detectWebMcp', () => {
  afterEach(() => {
    clear()
    __resetWebMcpActivity()
  })

  it('returns null with no ModelContext and no agent activity', async () => {
    expect(await detectWebMcp({ pollMs: 0 })).toBeNull()
  })

  it('does not treat document.modelContext alone as an agent (every WebMCP browser has it)', async () => {
    define(document, { registerTool: async () => undefined })
    expect(webMcpSupport()).toBe('document')
    expect(await detectWebMcp({ pollMs: 0 })).toBeNull()
  })

  it('detects an agent once it activates a tool', async () => {
    define(document, { registerTool: async () => undefined })
    noteWebMcpActivity('activated', 'search_products')
    const result = await detectWebMcp({ pollMs: 0 })
    expect(result).toMatchObject({ class: 'webmcp', trust: 'detected', confidence: 1, vendor: null })
    expect(result?.signals).toMatchObject({ webmcp: true, source: 'document', event: 'activated', tool: 'search_products' })
  })

  it('waits for activity that arrives during the poll window', async () => {
    setTimeout(() => noteWebMcpActivity('executed', 'late_tool'), 80)
    const result = await detectWebMcp({ pollMs: 400 })
    expect(result?.signals).toMatchObject({ tool: 'late_tool' })
  })

  it('still honours a legacy extension that injects navigator.modelContext with a vendor', async () => {
    define(navigator, { vendor: 'claude-extension', tools: [{}, {}] })
    const result = await detectWebMcp({ pollMs: 0 })
    expect(result).toMatchObject({ class: 'webmcp', vendor: 'claude-extension' })
    expect(result?.signals).toMatchObject({ source: 'legacy-extension', toolCount: 2 })
  })
})
