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
  /** A call that hasn't finished after this long is aborted and answered with an error. Default 30 000; 0 = never. */
  toolTimeoutMs?: number
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

export const DEFAULT_TOOL_TIMEOUT_MS = 30_000

/** Arguments as agents send them: an object, a JSON string of one, or nothing at all. */
export const toToolInput = (raw: unknown): Record<string, unknown> => {
  let value = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return {}
    }
  }
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

/**
 * What the agent receives: always a JSON-safe value. `undefined` becomes
 * `{ ok: true }`; a fetch `Response` returned by mistake is read; anything that
 * can't be serialised (circular, BigInt, DOM nodes) becomes a string.
 */
export const toToolResult = async (value: unknown): Promise<unknown> => {
  if (value === undefined) return { ok: true }
  if (typeof Response !== 'undefined' && value instanceof Response) {
    const text = await value.text().catch(() => '')
    let body: unknown = text
    try {
      body = JSON.parse(text)
    } catch {
      /* plain text */
    }
    return value.ok ? body : { error: `Request failed (${value.status})`, detail: typeof body === 'string' ? body.slice(0, 2000) : body }
  }
  try {
    return JSON.parse(JSON.stringify(value)) ?? null
  } catch {
    return String(value)
  }
}

/**
 * One agent call, made safe for whatever the agent and the tool do. The
 * options argument is optional (agents and polyfills often call
 * `execute(args)`), errors come back as `{ error }` values the agent can read
 * instead of exceptions, and a call that never finishes is aborted after
 * `timeoutMs`. Only the agent's own cancellation rejects.
 */
export const callTool = async (
  run: (input: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>,
  raw: unknown,
  agentSignal?: AbortSignal,
  timeoutMs = DEFAULT_TOOL_TIMEOUT_MS
): Promise<unknown> => {
  const controller = new AbortController()
  let timedOut = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let onAbort = () => controller.abort(agentSignal?.reason)
  // Settles only if the call is cut short: by the agent cancelling, or by the timeout.
  const stop = new Promise<never>((_, reject) => {
    onAbort = () => {
      controller.abort(agentSignal?.reason)
      reject(agentSignal?.reason ?? new DOMException('The agent cancelled the call.', 'AbortError'))
    }
    if (agentSignal?.aborted) onAbort()
    else agentSignal?.addEventListener?.('abort', onAbort, { once: true })
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true
        controller.abort()
        reject(new Error('timeout'))
      }, timeoutMs)
    }
  })
  try {
    // An async wrapper so a tool that throws synchronously is caught like one that rejects.
    const value = await Promise.race([(async () => run(toToolInput(raw), controller.signal))(), stop])
    return await toToolResult(value)
  } catch (error) {
    if (timedOut) {
      return { error: `The tool didn't finish within ${Math.round(timeoutMs / 1000)} s.`, hint: 'Try again, or with narrower arguments.' }
    }
    if (agentSignal?.aborted) throw error
    return { error: error instanceof Error ? error.message : String(error) }
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    agentSignal?.removeEventListener?.('abort', onAbort)
  }
}

export const toModelContextTool = (
  tool: GovernedTool,
  invoke: (tool: GovernedTool, input: unknown, signal?: AbortSignal) => Promise<unknown>,
  timeoutMs = DEFAULT_TOOL_TIMEOUT_MS
): ModelContextTool => {
  const descriptor: ModelContextTool = {
    name: tool.name,
    // The spec requires a description; fall back to the name rather than fail registration.
    description: tool.description || tool.name,
    execute: (input, options) => callTool((args, signal) => invoke(tool, args, signal), input, options?.signal, timeoutMs),
  }
  if (tool.title !== undefined) descriptor.title = tool.title
  if (tool.inputSchema !== undefined) descriptor.inputSchema = tool.inputSchema
  if (tool.annotations !== undefined) descriptor.annotations = { ...tool.annotations }
  return descriptor
}

export const createWebMcpAdapter = (options: WebMcpAdapterOptions = {}): WebMcpAdapter => {
  const invoke =
    options.invoke ??
    (async (tool, input, signal) => tool.execute(input as never, signal ? { identity: null, signal } : { identity: null }))
  const timeoutMs = options.toolTimeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS
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
            const d: WebMcpToolDescriptor = {
              name: tool.name,
              invoke: (input) => callTool((args, signal) => invoke(tool, args, signal), input, undefined, timeoutMs),
            }
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
            await context.registerTool(toModelContextTool(tool, invoke, timeoutMs), registerOptions)
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
