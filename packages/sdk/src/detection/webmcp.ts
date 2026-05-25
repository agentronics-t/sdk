import type { AgentIdentity } from '@agentronics/protocol'
import { SDK_VERSION } from "../version.js"

interface ModelContextLike {
  client?: string
  vendor?: string
  tools?: unknown[]
}

const readModelContext = (): ModelContextLike | null => {
  if (typeof navigator === 'undefined') return null
  const value = (navigator as unknown as { modelContext?: ModelContextLike }).modelContext
  return value && typeof value === 'object' ? value : null
}

export interface DetectWebMcpOptions {
  /**
   * Some extensions inject `navigator.modelContext` after first paint. Poll for this many
   * milliseconds before giving up. Set to 0 to read synchronously and return immediately.
   */
  pollMs?: number
}

export const detectWebMcp = async (
  options: DetectWebMcpOptions = {}
): Promise<AgentIdentity | null> => {
  const { pollMs = 500 } = options
  const start = Date.now()

  while (true) {
    const ctx = readModelContext()
    if (ctx) return buildIdentity(ctx)
    if (Date.now() - start >= pollMs) return null
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

const buildIdentity = (ctx: ModelContextLike): AgentIdentity => ({
  class: 'webmcp',
  trust: 'detected',
  confidence: 1,
  vendor: ctx.vendor ?? ctx.client ?? null,
  userAgent: typeof navigator === 'undefined' ? null : navigator.userAgent,
  detectionVersion: SDK_VERSION,
  signals: {
    webmcp: true,
    toolCount: Array.isArray(ctx.tools) ? ctx.tools.length : 0,
  },
})
