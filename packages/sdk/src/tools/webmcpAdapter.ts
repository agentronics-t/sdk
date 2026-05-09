import type { GovernedTool } from './registry.js'

export interface WebMcpToolDescriptor {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
  invoke(input?: unknown): Promise<unknown>
}

export interface WebMcpProvider {
  provideContext(payload: { tools: WebMcpToolDescriptor[] }): { revoke: () => void }
}

export interface WebMcpAdapterOptions {
  provider?: WebMcpProvider
  doc?: { defaultView?: WindowLike | null } | null
  invoke?: (tool: GovernedTool, input: unknown) => Promise<unknown>
}

interface WindowLike {
  navigator?: { modelContext?: WebMcpProvider }
}

const resolveProvider = (options: WebMcpAdapterOptions): WebMcpProvider | null => {
  if (options.provider) return options.provider
  const win = options.doc?.defaultView ?? (typeof globalThis !== 'undefined' ? (globalThis as WindowLike) : null)
  return win?.navigator?.modelContext ?? null
}

const toDescriptor = (
  tool: GovernedTool,
  invoke: (tool: GovernedTool, input: unknown) => Promise<unknown>
): WebMcpToolDescriptor => {
  const descriptor: WebMcpToolDescriptor = {
    name: tool.name,
    invoke: (input) => invoke(tool, input),
  }
  if (tool.description !== undefined) descriptor.description = tool.description
  if (tool.inputSchema !== undefined) descriptor.inputSchema = tool.inputSchema
  return descriptor
}

export interface WebMcpAdapter {
  publish(tools: GovernedTool[]): { revoked: boolean }
  revoke(): void
  available(): boolean
}

export const createWebMcpAdapter = (options: WebMcpAdapterOptions = {}): WebMcpAdapter => {
  const invoke = options.invoke ?? (async (tool, input) => tool.execute(input as never, { identity: null }))
  let handle: { revoke: () => void } | null = null

  return {
    publish(tools) {
      const provider = resolveProvider(options)
      if (!provider) return { revoked: false }
      handle?.revoke()
      handle = provider.provideContext({ tools: tools.map((tool) => toDescriptor(tool, invoke)) })
      return { revoked: true }
    },
    revoke() {
      handle?.revoke()
      handle = null
    },
    available: () => Boolean(resolveProvider(options)),
  }
}
