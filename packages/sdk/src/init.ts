import {
  AgentronicsError,
  classifyApiKey,
  PUBLISHABLE_KEY_PREFIX,
  type AgentIdentity,
  type PolicyEvaluation,
  type PolicyRule,
  type TraceEvent,
} from '@agentronics/protocol'
import { detectAgent, type DetectAgentOptions } from './detection/index.js'
import {
  createIdentityStore,
  type PresentedIdentity,
  type PresentIdentityOptions,
} from './auth/identity.js'
import { createAuthEngine, type AuthContext, type AuthEngine, type AuthInput } from './auth/engine.js'
import { createAgentContextStore, type AgentContextStore } from './auth/agentContext.js'
import { createPolicyEngine, type PolicyEngine } from './authz/engine.js'
import { createPolicyCache, type PolicyCache } from './authz/policyCache.js'
import { installDomEnforcer } from './authz/domEnforcer.js'
import { createMemoryStore, type MemoryStore } from './memory/store.js'
import {
  createSiteMemoryStore,
  type SiteMemoryStore,
  type ProvideForPageInput,
} from './memory/siteMemory.js'
import { createMemoryCache, type MemoryCache } from './memory/memoryCache.js'
import {
  installMetaTags,
  installMemoryOverlay,
  fetchWellKnownContext,
} from './memory/delivery/index.js'
import { createToolRegistry, type GovernedTool, type ToolRegistry } from './tools/registry.js'
import {
  createProgressionStore,
  type ProgressionConfig,
  type ProgressionStore,
} from './tools/progression.js'
import { surfaceTools, explainSurfacing, type SurfacingDecision } from './tools/surfacing.js'
import { groupTools, type ToolGroupSummary } from './tools/groups.js'
import { estimateBudget, type TokenBudgetReport } from './tools/tokenEstimate.js'
import { createWebMcpAdapter, type WebMcpAdapter } from './tools/webmcpAdapter.js'
import type { SiteMemory } from '@agentronics/protocol'
import {
  createConsoleExporter,
  createGatewayExporter,
  createTracer,
  createWebhookExporter,
  type TraceExporter,
  type Tracer,
} from './observability/index.js'

export interface InitOptions {
  publishableKey: string
  siteId?: string
  gatewayUrl?: string
  debug?: boolean
  policies?: PolicyRule[]
  siteMemory?: Partial<SiteMemory>
  auth?: AuthContext
  progression?: ProgressionConfig
  tools?: GovernedTool[]
  trace?: {
    enabled?: boolean
    bufferSize?: number
    traceRate?: number
    errorRate?: number
    scrubPaths?: string[]
    exporters?: TraceExporter[]
    gateway?: boolean
    webhookUrl?: string
  }
}

export interface AgentronicsClient {
  readonly publishableKey: string
  readonly siteId: string
  readonly gatewayUrl: string
  readonly debug: boolean
  readonly memory: MemoryStore
  readonly siteMemory: SiteMemoryStore
  readonly memoryCache: MemoryCache
  readonly tracer: Tracer
  readonly auth: AuthEngine
  readonly agentContext: AgentContextStore
  readonly authz: PolicyEngine
  readonly policyCache: PolicyCache
  readonly tools: ToolRegistry
  readonly progression: ProgressionStore | null
  readonly webmcp: WebMcpAdapter
  detect(options?: DetectAgentOptions): Promise<AgentIdentity | null>
  authenticate(input: AuthInput): Promise<AgentIdentity | null>
  presentIdentity(input: PresentIdentityOptions): PresentedIdentity
  clearIdentity(): void
  presentedIdentity(): PresentedIdentity | null
  setPolicies(rules: PolicyRule[]): void
  listPolicies(): PolicyRule[]
  evaluate(tool: string, options?: { identity?: AgentIdentity | null }): Promise<PolicyEvaluation>
  syncPolicies(): Promise<PolicyRule[]>
  syncSiteMemory(): Promise<SiteMemory | null>
  provideSiteMemory(memory: Partial<SiteMemory>): SiteMemory
  provideForPage(input: ProvideForPageInput): void
  installMemoryDelivery(options?: {
    metaTags?: boolean
    overlay?: boolean
  }): { uninstall: () => void }
  fetchWellKnown(origin?: string): Promise<SiteMemory | null>
  installDomEnforcer(): { uninstall: () => void }
  registerTool(tool: GovernedTool): () => void
  surfaceTools(options?: { identity?: AgentIdentity | null }): GovernedTool[]
  explainSurfacing(options?: { identity?: AgentIdentity | null }): SurfacingDecision[]
  groupedTools(options?: { identity?: AgentIdentity | null }): ToolGroupSummary[]
  estimateTokens(options?: { identity?: AgentIdentity | null }): TokenBudgetReport
  publishToWebMcp(options?: { identity?: AgentIdentity | null }): { revoked: boolean; surfaced: number }
  notifyToolInvoked(toolName: string): void
  traces(): TraceEvent[]
  clearTraces(): void
  /**
   * Sanity-check the publishable key + gateway URL. Hits `GET /v1/health` and
   * resolves to `{ ok: true, ... }` on 2xx, `{ ok: false, status, error }`
   * otherwise. Doesn't throw — designed for "did my key wire up correctly?"
   * UX without forcing the host page into a try/catch.
   */
  ping(): Promise<{ ok: true; status: number; body: unknown } | { ok: false; status: number; error: string }>
}

const DEFAULT_GATEWAY_URL = 'https://gateway.agentronics.dev'

export const init = (options: InitOptions): AgentronicsClient => {
  const {
    publishableKey,
    siteId = 'default',
    gatewayUrl = DEFAULT_GATEWAY_URL,
    debug = false,
    policies = [],
    trace = {},
  } = options

  const kind = classifyApiKey(publishableKey)
  if (kind === 'secret') {
    throw new AgentronicsError(
      'wrong_key_kind',
      'A secret key was passed to Agentronics.init(). Browser code must use a publishable key (agtx_pk_*).'
    )
  }
  if (kind !== 'publishable') {
    throw new AgentronicsError(
      'invalid_api_key',
      `Agentronics.init() expected a key starting with "${PUBLISHABLE_KEY_PREFIX}".`
    )
  }

  const traceEnabled = trace.enabled ?? true
  const exporters = [
    ...(debug ? [createConsoleExporter()] : []),
    ...(trace.gateway ? [createGatewayExporter({ gatewayUrl, publishableKey })] : []),
    ...(trace.webhookUrl ? [createWebhookExporter({ url: trace.webhookUrl })] : []),
    ...(trace.exporters ?? []),
  ]
  const tracerOptions: Parameters<typeof createTracer>[0] = {
    siteId,
    exporters: traceEnabled ? exporters : [],
    onExporterError: (error, exporter) => {
      if (debug) console.warn(`[agentronics] trace exporter "${exporter.name}" failed`, error)
    },
  }
  if (trace.bufferSize !== undefined) tracerOptions.bufferSize = trace.bufferSize
  if (trace.traceRate !== undefined) tracerOptions.traceRate = trace.traceRate
  if (trace.errorRate !== undefined) tracerOptions.errorRate = trace.errorRate
  if (trace.scrubPaths !== undefined) tracerOptions.scrubPaths = trace.scrubPaths
  const tracer = createTracer(tracerOptions)
  const emitTrace = (input: Parameters<Tracer['emit']>[0]) => {
    if (!traceEnabled) return
    void tracer.emit(input)
  }
  const identityStore = createIdentityStore()
  const authOptions: Parameters<typeof createAuthEngine>[0] = {
    onTrace: emitTrace,
  }
  if (options.auth !== undefined) authOptions.context = options.auth
  const auth = createAuthEngine(authOptions)
  const agentContext = createAgentContextStore()
  const policyEngine = createPolicyEngine(policies)
  const policyCache = createPolicyCache({ gatewayUrl, siteId, publishableKey })
  const memory = createMemoryStore({ onTrace: emitTrace })
  const siteMemoryOptions: Parameters<typeof createSiteMemoryStore>[0] = {
    onTrace: emitTrace,
  }
  if (options.siteMemory !== undefined) siteMemoryOptions.initial = options.siteMemory
  const siteMemory = createSiteMemoryStore(siteMemoryOptions)
  const memoryCache = createMemoryCache({ gatewayUrl, siteId, publishableKey })

  const detect = async (detectOptions?: DetectAgentOptions) => {
    const start = Date.now()
    const detected = await detectAgent(detectOptions)
    const identity = identityStore.preferOver(detected)
    if (traceEnabled) {
      await tracer.emit({
        type: identity ? 'agent.detected' : 'agent.missed',
        agent: identity,
        durationMs: Date.now() - start,
        metadata: {
          detectedClass: detected?.class ?? null,
          presented: identityStore.snapshot() !== null,
        },
      })
    }
    agentContext.set(identity, 'detect')
    return identity
  }
  const evaluate = async (tool: string, opts: { identity?: AgentIdentity | null } = {}) => {
    const start = Date.now()
    const identity = opts.identity !== undefined ? opts.identity : await detect()
    const policy = policyEngine.evaluate({ tool, identity })
    if (traceEnabled) {
      await tracer.emit({
        type: 'authz.evaluated',
        tool,
        agent: identity,
        policy,
        outcome: policy.decision === 'deny' ? 'blocked' : 'success',
        durationMs: Date.now() - start,
      })
    }
    return policy
  }
  const tools = createToolRegistry({
    evaluate,
    setPolicies: (rules) => policyEngine.set(rules),
    listPolicies: () => policyEngine.list(),
    onTrace: emitTrace,
  })
  for (const tool of options.tools ?? []) tools.register(tool)

  const progression = options.progression
    ? createProgressionStore(options.progression, { onTrace: emitTrace })
    : null

  const surfacingContext = (identity: AgentIdentity | null) => {
    const ctx: { identity: AgentIdentity | null; stage?: string; enabledStages?: string[] } = {
      identity,
    }
    if (progression) {
      ctx.stage = progression.current()
      ctx.enabledStages = progression.enabledStages()
    }
    return ctx
  }

  const surfaceFor = (identity: AgentIdentity | null) =>
    surfaceTools(tools.list(), surfacingContext(identity))

  const handleToolInvoked = (toolName: string) => {
    if (!progression) return
    const transition = progression.notify(toolName)
    if (transition.changed) webmcp.publish(surfaceFor(null))
  }

  const webmcp = createWebMcpAdapter({
    invoke: async (tool, input) => {
      const result = await tools.execute(tool.name, input, null)
      handleToolInvoked(tool.name)
      return result
    },
  })

  return Object.freeze({
    publishableKey,
    siteId,
    gatewayUrl,
    debug,
    memory,
    siteMemory,
    memoryCache,
    tracer,
    auth,
    agentContext,
    authz: policyEngine,
    policyCache,
    tools,
    progression,
    webmcp,
    detect,
    authenticate: async (input: AuthInput) => {
      const identity = await auth.authenticate(input)
      agentContext.set(identity, 'authenticate')
      return identity
    },
    presentIdentity: (input: PresentIdentityOptions) => {
      const presented = identityStore.present(input)
      emitTrace({
        type: 'auth.identity_presented',
        agent: presented.identity,
        metadata: { vendor: presented.identity.vendor, class: presented.identity.class },
      })
      agentContext.set(presented.identity, 'declare')
      return presented
    },
    clearIdentity: () => {
      identityStore.clear()
      emitTrace({ type: 'auth.identity_cleared' })
      agentContext.set(null, 'cleared')
    },
    presentedIdentity: () => identityStore.snapshot(),
    setPolicies: (rules: PolicyRule[]) => {
      policyEngine.set(rules)
      emitTrace({ type: 'authz.policies_set', metadata: { count: rules.length } })
    },
    listPolicies: () => policyEngine.list(),
    syncPolicies: async () => {
      const snapshot = await policyCache.sync()
      policyEngine.set(snapshot.policies)
      emitTrace({ type: 'authz.policies_set', metadata: { count: snapshot.policies.length, synced: true } })
      return snapshot.policies
    },
    syncSiteMemory: async () => {
      const snapshot = await memoryCache.sync()
      if (snapshot.memory) {
        siteMemory.replace(snapshot.memory)
        emitTrace({
          type: 'memory.updated',
          metadata: { kind: 'site', operation: 'sync', etag: snapshot.etag },
        })
      }
      return snapshot.memory
    },
    provideSiteMemory: (next: Partial<SiteMemory>) => siteMemory.provide(next),
    provideForPage: (input: ProvideForPageInput) => {
      siteMemory.provideForPage(input)
    },
    installMemoryDelivery: ({ metaTags = true, overlay = false } = {}) => {
      const handles: Array<{ uninstall: () => void }> = []
      if (metaTags) handles.push(installMetaTags({ snapshot: siteMemory.snapshot() }))
      if (overlay) handles.push(installMemoryOverlay({ snapshot: siteMemory.snapshot() }))
      return {
        uninstall: () => {
          handles.forEach((handle) => handle.uninstall())
        },
      }
    },
    fetchWellKnown: async (origin?: string) => {
      const wellKnownOptions: Parameters<typeof fetchWellKnownContext>[0] = {}
      if (origin !== undefined) wellKnownOptions.origin = origin
      const memorySnapshot = await fetchWellKnownContext(wellKnownOptions)
      if (memorySnapshot) {
        siteMemory.replace(memorySnapshot)
        emitTrace({
          type: 'memory.updated',
          metadata: { kind: 'site', operation: 'wellKnown', origin: origin ?? null },
        })
      }
      return memorySnapshot
    },
    installDomEnforcer: () =>
      installDomEnforcer({
        policyEngine,
        getIdentity: () => detect({ webmcp: { pollMs: 0 } }),
      }),
    registerTool: (tool: GovernedTool) => tools.register(tool),
    surfaceTools: ({ identity = null }: { identity?: AgentIdentity | null } = {}) => surfaceFor(identity),
    explainSurfacing: ({ identity = null }: { identity?: AgentIdentity | null } = {}) =>
      explainSurfacing(tools.list(), surfacingContext(identity)),
    groupedTools: ({ identity = null }: { identity?: AgentIdentity | null } = {}) => groupTools(surfaceFor(identity)),
    estimateTokens: ({ identity = null }: { identity?: AgentIdentity | null } = {}) => estimateBudget(surfaceFor(identity)),
    publishToWebMcp: ({ identity = null }: { identity?: AgentIdentity | null } = {}) => {
      const surfaced = surfaceFor(identity)
      const result = webmcp.publish(surfaced)
      surfaced.forEach((tool) => {
        emitTrace({
          type: 'tool.surfaced',
          tool: tool.name,
          metadata: { state: 'published', trust: identity?.trust ?? null, group: tool.group ?? null },
        })
      })
      return { revoked: result.revoked, surfaced: surfaced.length }
    },
    notifyToolInvoked: (toolName: string) => handleToolInvoked(toolName),
    evaluate,
    traces: () => tracer.list(),
    clearTraces: () => tracer.clear(),
    async ping() {
      try {
        const response = await fetch(`${gatewayUrl.replace(/\/$/, '')}/v1/health`, {
          method: 'GET',
          headers: { authorization: `Bearer ${publishableKey}` },
        })
        if (!response.ok) {
          return { ok: false as const, status: response.status, error: `gateway returned ${response.status}` }
        }
        const body = (await response.json().catch(() => null)) ?? {}
        return { ok: true as const, status: response.status, body }
      } catch (error) {
        return {
          ok: false as const,
          status: 0,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    },
  })
}
