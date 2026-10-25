import type { GovernedTool } from './registry.js'
import {
  noteWebMcpActivity,
  resolveModelContext,
  type LegacyProvider,
  type ModelContextLike,
  type ModelContextSource,
  type ModelContextTool,
} from './modelContext.js'

/** @deprecated The pre-2026 `provideContext()` shape; kept for old polyfills. */
export type WebMcpProvider = LegacyProvider

export interface WebMcpToolDescriptor {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
  invoke(input?: unknown): Promise<unknown>
}

export interface WebMcpAdapterOptions {
  /** Explicit ModelContext (tests, or a host that isn't `globalThis`). */
  modelContext?: ModelContextLike | LegacyProvider
  /** @deprecated use `modelContext`. */
  provider?: LegacyProvider
  /** Where to look for `document.modelContext` / `navigator.modelContext`. */
  host?: { document?: { modelContext?: unknown } | null; navigator?: { modelContext?: unknown } | null } | null
  invoke?: (tool: GovernedTool, input: unknown, signal?: AbortSignal) => Promise<unknown>
}

/** Per-tool result of the last publish — the "callable / failed" status the console shows. */
export interface WebMcpRegistration {
  name: string
  status: 'callable' | 'failed'
  error?: string
}

export interface WebMcpPublishResult {
  /** True when a WebMCP surface was found and the previous registrations were withdrawn. */
  revoked: boolean
  /** Resolves once every tool's registerTool() settled. Empty when WebMCP is unavailable. */
  registrations: Promise<WebMcpRegistration[]>
}

export interface WebMcpAdapter {
  publish(tools: GovernedTool[]): WebMcpPublishResult
  revoke(): void
  available(): boolean
  /** Which surface was used: document.modelContext, the navigator alias, or a legacy polyfill. */
  source(): ModelContextSource | null
  /** Registration status from the most recent publish. */
  status(): WebMcpRegistration[]
}

const isLegacy = (source: ModelContextSource, _ctx: ModelContextLike | LegacyProvider): _ctx is LegacyProvider =>
  source === 'legacy'

export const toModelContextTool = (
  tool: GovernedTool,
  invoke: (tool: GovernedTool, input: unknown, signal?: AbortSignal) => Promise<unknown>
): ModelContextTool => {
  const descriptor: ModelContextTool = {
    name: tool.name,
    // The spec requires a description; fall back to the name rather than fail registration.
    description: tool.description ?? tool.name,
    execute: (input, { signal }) => invoke(tool, input ?? {}, signal),
  }
  if (tool.title !== undefined) descriptor.title = tool.title
  if (tool.inputSchema !== undefined) descriptor.inputSchema = tool.inputSchema
  if (tool.annotations !== undefined) descriptor.annotations = { ...tool.annotations }
  return descriptor
}

export const createWebMcpAdapter = (options: WebMcpAdapterOptions = {}): WebMcpAdapter => {
  const invoke =
    options.invoke ?? (async (tool, input) => tool.execute(input as never, { identity: null }))
  let controller: AbortController | null = null
  let legacyHandle: { revoke: () => void } | null = null
  let detachEvents: (() => void) | null = null
  let lastStatus: WebMcpRegistration[] = []

  const resolve = () => {
    const explicit = options.modelContext ?? options.provider
    if (explicit) {
      const source: ModelContextSource =
        typeof (explicit as Partial<ModelContextLike>).registerTool === 'function' ? 'document' : 'legacy'
      return { source, context: explicit }
    }
    return resolveModelContext(options.host)
  }

  const withdraw = () => {
    controller?.abort()
    controller = null
    legacyHandle?.revoke()
    legacyHandle = null
  }

  const attachEvents = (context: ModelContextLike) => {
    if (detachEvents || typeof context.addEventListener !== 'function') return
    const activated = (event: Event) => noteWebMcpActivity('activated', (event as Event & { toolName?: string }).toolName ?? '')
    const cancelled = (event: Event) => noteWebMcpActivity('cancelled', (event as Event & { toolName?: string }).toolName ?? '')
    context.addEventListener('toolactivated', activated)
    context.addEventListener('toolcancel', cancelled)
    detachEvents = () => {
      context.removeEventListener?.('toolactivated', activated)
      context.removeEventListener?.('toolcancel', cancelled)
      detachEvents = null
    }
  }

  return {
    publish(tools) {
      const resolved = resolve()
      if (!resolved) return { revoked: false, registrations: Promise.resolve([]) }
      withdraw()

      if (isLegacy(resolved.source, resolved.context)) {
        legacyHandle = resolved.context.provideContext({
          tools: tools.map((tool) => {
            const d: WebMcpToolDescriptor = { name: tool.name, invoke: (input) => invoke(tool, input) }
            if (tool.description !== undefined) d.description = tool.description
            if (tool.inputSchema !== undefined) d.inputSchema = tool.inputSchema
            return d
          }),
        })
        lastStatus = tools.map((tool) => ({ name: tool.name, status: 'callable' }))
        return { revoked: true, registrations: Promise.resolve(lastStatus) }
      }

      const context = resolved.context
      attachEvents(context)
      const current = new AbortController()
      controller = current
      const registrations = Promise.all(
        tools.map(async (tool): Promise<WebMcpRegistration> => {
          try {
            const registerOptions: { signal: AbortSignal; exposedTo?: string[] } = { signal: current.signal }
            if (tool.exposedTo?.length) registerOptions.exposedTo = tool.exposedTo
            await context.registerTool(toModelContextTool(tool, invoke), registerOptions)
            return { name: tool.name, status: 'callable' }
          } catch (error) {
            return { name: tool.name, status: 'failed', error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }
          }
        })
      ).then((result) => {
        // A newer publish replaced this one; don't overwrite its status.
        if (controller === current) lastStatus = result
        return result
      })
      return { revoked: true, registrations }
    },
    revoke() {
      withdraw()
      detachEvents?.()
      lastStatus = []
    },
    available: () => Boolean(resolve()),
    source: () => resolve()?.source ?? null,
    status: () => [...lastStatus],
  }
}
