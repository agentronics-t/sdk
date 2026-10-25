import type { AgentIdentity } from '@agentronics/protocol'
import { SDK_VERSION } from '../version.js'
import { lastWebMcpActivity, resolveModelContext, type WebMcpActivity } from '../tools/modelContext.js'

/**
 * WebMCP agent detection.
 *
 * `document.modelContext` exists for every visitor of a WebMCP-capable browser,
 * so its presence alone is NOT an agent — it only means the page can serve
 * tools. An agent is detected once it acts: a `toolactivated` event or a tool
 * call through the ModelContext (both recorded by the WebMCP adapter).
 *
 * Old browser-extension polyfills injected `navigator.modelContext` with a
 * `vendor`/`client` field only while an agent was attached; that is still
 * honoured as an agent signal.
 */

interface LegacyInjectedContext {
  client?: string
  vendor?: string
  tools?: unknown[]
}

const readLegacyInjected = (): LegacyInjectedContext | null => {
  if (typeof navigator === 'undefined') return null
  const value = (navigator as unknown as { modelContext?: LegacyInjectedContext }).modelContext
  if (!value || typeof value !== 'object') return null
  return value.vendor || value.client ? value : null
}

export interface DetectWebMcpOptions {
  /**
   * Wait up to this many milliseconds for an agent to act (or an extension to
   * inject itself). 0 reads once and returns immediately.
   */
  pollMs?: number
}

/** Whether this page can serve WebMCP tools, and through which surface. */
export const webMcpSupport = () => resolveModelContext()?.source ?? null

export const detectWebMcp = async (
  options: DetectWebMcpOptions = {}
): Promise<AgentIdentity | null> => {
  const { pollMs = 500 } = options
  const start = Date.now()

  while (true) {
    const activity = lastWebMcpActivity()
    if (activity) return fromActivity(activity)
    const legacy = readLegacyInjected()
    if (legacy) return fromLegacy(legacy)
    if (Date.now() - start >= pollMs) return null
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

const base = (): Omit<AgentIdentity, 'vendor' | 'signals'> => ({
  class: 'webmcp',
  trust: 'detected',
  confidence: 1,
  userAgent: typeof navigator === 'undefined' ? null : navigator.userAgent,
  detectionVersion: SDK_VERSION,
})

const fromActivity = (activity: WebMcpActivity): AgentIdentity => ({
  ...base(),
  vendor: null,
  signals: { webmcp: true, source: webMcpSupport(), event: activity.type, tool: activity.toolName },
})

const fromLegacy = (ctx: LegacyInjectedContext): AgentIdentity => ({
  ...base(),
  vendor: ctx.vendor ?? ctx.client ?? null,
  signals: {
    webmcp: true,
    source: 'legacy-extension',
    toolCount: Array.isArray(ctx.tools) ? ctx.tools.length : 0,
  },
})
