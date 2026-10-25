import { afterEach, describe, expect, it } from 'vitest'
import { init } from './init.js'
import { __resetWebMcpActivity, type ModelContextTool } from './tools/modelContext.js'

const installModelContext = () => {
  const registered = new Map<string, ModelContextTool>()
  const target = new EventTarget()
  const ctx = {
    async registerTool(tool: ModelContextTool, options?: { signal?: AbortSignal }) {
      registered.set(tool.name, tool)
      options?.signal?.addEventListener('abort', () => registered.delete(tool.name))
    },
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
  }
  Object.defineProperty(document, 'modelContext', { value: ctx, configurable: true })
  return { registered, fire: (type: string, toolName: string) => target.dispatchEvent(Object.assign(new Event(type), { toolName })) }
}

afterEach(() => {
  delete (document as unknown as { modelContext?: unknown }).modelContext
  __resetWebMcpActivity()
})

describe('init + WebMCP (document.modelContext)', () => {
  it('publishes tools with approved descriptions and reports each one callable', async () => {
    const { registered } = installModelContext()
    const client = init({
      publishableKey: 'agtx_pk_demo_1234567890',
      autoDetect: false,
      toolDescriptions: { search: 'Search products by keyword.' },
      tools: [{ name: 'search', title: 'Search', description: 'A long original description that the console shortened.', annotations: { readOnlyHint: true }, execute: () => [] }],
    })
    const result = client.publishToWebMcp()
    expect(result.surfaced).toBe(1)
    await expect(result.registrations).resolves.toEqual([{ name: 'search', status: 'callable' }])
    expect(registered.get('search')).toMatchObject({ description: 'Search products by keyword.', title: 'Search', annotations: { readOnlyHint: true } })
    expect(client.traces().some((t) => t.type === 'tool.surfaced' && t.metadata.state === 'published')).toBe(true)
  })

  it('attributes the session to a WebMCP agent once it activates a tool', async () => {
    const { registered, fire } = installModelContext()
    const client = init({ publishableKey: 'agtx_pk_demo_1234567890', autoDetect: false, tools: [{ name: 'ping', description: 'Ping', execute: () => 'pong' }] })
    await client.publishToWebMcp().registrations
    expect(client.agentContext.snapshot().identity).toBeNull()
    fire('toolactivated', 'ping')
    expect(client.agentContext.snapshot().identity).toMatchObject({ class: 'webmcp', trust: 'detected' })
    await expect(registered.get('ping')!.execute({}, { signal: new AbortController().signal })).resolves.toBe('pong')
    const executed = client.traces().find((t) => t.type === 'tool.executed')
    expect(executed?.agent?.class).toBe('webmcp')
  })
})
