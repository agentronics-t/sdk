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
  const candidate = win?.navigator?.modelContext
  if (!candidate) return null
  // Some polyfills / browser extensions patch `navigator.modelContext` with a
  // different shape (e.g. `setTools` instead of `provideContext`). Only accept
  // the object as a provider when it exposes the method we actually call;
  // otherwise the rest of the SDK falls back to no-op publishing instead of
  // throwing `provideContext is not a function` at runtime.
  if (typeof (candidate as Partial<WebMcpProvider>).provideContext !== 'function') {
    return null
  }
  return candidate
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
