/**
 * The WebMCP `ModelContext` surface, per the W3C WebMCP draft (Oct 2026):
 *
 *   await document.modelContext.registerTool(tool, { signal, exposedTo })
 *
 * - The getter lives on `document`. `navigator.modelContext` was the old name;
 *   Chrome 150 kept it as an alias and Chrome 152 removed it, so it's read
 *   only as a fallback.
 * - `registerTool()` is async. There is no `unregisterTool()`; aborting the
 *   `signal` passed at registration unregisters the tool.
 * - `toolactivated` / `toolcancel` events fire on the ModelContext when an
 *   agent starts or cancels a tool call — the only reliable "an agent is here"
 *   signal, because the API itself exists for every visitor of a WebMCP browser.
 * - The declarative form API (`<form toolname>`) was removed from the spec
 *   (Oct 8, 2026) and lives on only as an explainer; the SDK registers every
 *   tool imperatively.
 */

export interface ToolAnnotations {
  /** The tool only reads; agents may call it without asking the user. */
  readOnlyHint?: boolean
  /** The tool's output includes content the site didn't author (reviews, messages, …). */
  untrustedContentHint?: boolean
  /** Payments, deletes, sends — the agent should confirm with the user first. */
  consequentialHint?: boolean
  /** Exposed only to agent debugging tools. */
  debugging?: boolean
}

export interface ToolExecuteOptions {
  signal: AbortSignal
}

export interface ModelContextTool {
  name: string
  title?: string
  description: string
  inputSchema?: Record<string, unknown>
  annotations?: ToolAnnotations
  execute: (input: Record<string, unknown>, options: ToolExecuteOptions) => Promise<unknown>
}

export interface RegisterToolOptions {
  signal?: AbortSignal
  /** Origins (besides this one) whose agents may see the tool. */
  exposedTo?: string[]
}

export interface ModelContextLike {
  registerTool(tool: ModelContextTool, options?: RegisterToolOptions): Promise<void> | void
  addEventListener?: (type: string, listener: (event: Event) => void) => void
  removeEventListener?: (type: string, listener: (event: Event) => void) => void
}

/** Very old polyfills exposed `provideContext({ tools })` instead of `registerTool`. */
export interface LegacyProvider {
  provideContext(payload: {
    tools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown>; invoke(input?: unknown): Promise<unknown> }>
  }): { revoke: () => void }
}

export type ModelContextSource = 'document' | 'navigator' | 'legacy'

export interface ResolvedModelContext {
  source: ModelContextSource
  context: ModelContextLike | LegacyProvider
}

interface HostLike {
  document?: { modelContext?: unknown } | null
  navigator?: { modelContext?: unknown } | null
}

const hasFn = (value: unknown, key: string): boolean =>
  typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>)[key] === 'function'

/** Find the page's ModelContext: `document.modelContext`, then the legacy names. */
export const resolveModelContext = (host?: HostLike | null): ResolvedModelContext | null => {
  const h: HostLike | null = host ?? (typeof globalThis === 'undefined' ? null : (globalThis as HostLike))
  if (!h) return null
  const fromDocument = h.document?.modelContext
  if (hasFn(fromDocument, 'registerTool')) return { source: 'document', context: fromDocument as ModelContextLike }
  const fromNavigator = h.navigator?.modelContext
  if (hasFn(fromNavigator, 'registerTool')) return { source: 'navigator', context: fromNavigator as ModelContextLike }
  if (hasFn(fromNavigator, 'provideContext')) return { source: 'legacy', context: fromNavigator as LegacyProvider }
  return null
}

// ---- agent activity ------------------------------------------------------------
// Shared by the adapter (which sees tool calls) and detection (which reports
// a WebMCP agent once one has acted).

export interface WebMcpActivity {
  type: 'activated' | 'cancelled' | 'executed'
  toolName: string
  at: number
}

let lastActivity: WebMcpActivity | null = null
const activityListeners = new Set<(activity: WebMcpActivity) => void>()

export const noteWebMcpActivity = (type: WebMcpActivity['type'], toolName: string) => {
  lastActivity = { type, toolName, at: Date.now() }
  activityListeners.forEach((listener) => listener(lastActivity!))
}

export const lastWebMcpActivity = () => lastActivity

export const onWebMcpActivity = (listener: (activity: WebMcpActivity) => void) => {
  activityListeners.add(listener)
  return () => {
    activityListeners.delete(listener)
  }
}

/** @internal test helper */
export const __resetWebMcpActivity = () => {
  lastActivity = null
  activityListeners.clear()
}
