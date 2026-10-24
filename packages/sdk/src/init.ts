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
import { createVisionDetector, type VisionDetector, type VisionDetectorOptions } from './detection/vision.js'
import { SDK_VERSION } from './version.js'
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
import { createToolSync } from './tools/toolSync.js'
import {
  createProgressionStore,
  type ProgressionConfig,
  type ProgressionStore,
} from './tools/progression.js'
import { surfaceTools, explainSurfacing, type SurfacingDecision } from './tools/surfacing.js'
import { groupTools, type ToolGroupSummary } from './tools/groups.js'
import { estimateBudget, type TokenBudgetReport } from './tools/tokenEstimate.js'
import { createWebMcpAdapter, type WebMcpAdapter, type WebMcpRegistration } from './tools/webmcpAdapter.js'
import { onWebMcpActivity } from './tools/modelContext.js'
import { createReviewPrompt, type Reviewer } from './authz/reviewPrompt.js'
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
  /**
   * Override the gateway URL the SDK calls. **Reserved for local development
   * only** — the only accepted values are `localhost` / `127.0.0.1` URLs (so
   * `pnpm dev` against a local gateway works). Any other value throws at
   * `init()` time.
   *
   * Production deployments must omit this option. The SDK is hard-coded to
   * call `https://gateway.agentronics.dev`. Custom backends are not
   * supported, by design — see the project README + LICENSE NOTICE.
   *
   * @internal — kept on the public type only so dev tooling type-checks.
   */
  gatewayUrl?: string
  debug?: boolean
  policies?: PolicyRule[]
  siteMemory?: Partial<SiteMemory>
  auth?: AuthContext
  progression?: ProgressionConfig
  tools?: GovernedTool[]
  /**
   * Who approves tool calls whose policy decision is `review`. Default in the
   * browser: a small "Allow / Not now" dialog for the person on the page.
   * Pass your own function to use your UI, or `false` to refuse every review.
   */
  review?: Reviewer | false
  /**
   * Approved tool descriptions from the console's Procedural memory page
   * (`createDashboardSync().pullConfig().toolDescriptions`). They replace the
   * code's description when tools are published to agents.
   */
  toolDescriptions?: Record<string, string>
  /**
   * Run agent detection automatically on init and keep the resulting
   * identity in agentContext so every subsequent tools.execute() call gets
   * attributed without the host page passing identity through. Default
   * `true` — opt out with `false` for privacy-mode hosts, or pass
   * DetectAgentOptions to tune the detectors (e.g. raise the DOM threshold).
   *
   * The first detection cycle runs synchronously where possible (DOM
   * heuristics) and continues asynchronously for WebMCP polling, so very
   * early click handlers may see identity=null for a single frame; the
   * `ready` promise on the returned client resolves once the cycle finishes.
   */
  autoDetect?: boolean | DetectAgentOptions
  /**
   * Watch interactions for vision-model ("screenshot") agents — teleport and
   * centre clicks, metronome typing. On by default in the browser whenever
   * `autoDetect` is on; reads timing and coordinates only, never keystrokes.
   */
  visionDetection?: boolean | Omit<VisionDetectorOptions, 'onDetect'>
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
  /** The vision-agent monitor, when running. */
  readonly vision: VisionDetector | null
  /**
   * Resolves once the initial autoDetect cycle finishes. Rejects only if the
   * autoDetect configuration itself is invalid; detection failures resolve to
   * `null` (treated as "human or undetectable agent"). When `autoDetect` was
   * disabled the promise resolves immediately to `null`.
   */
  readonly ready: Promise<AgentIdentity | null>
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
  /** Replace the description overrides (see `toolDescriptions`). */
  setToolDescriptions(descriptions: Record<string, string>): void
  /** Push the full tool registry to the gateway so the dashboard can render
   *  the page-wise view (schemas, per-tool tokens, context fullness). */
  syncTools(): Promise<number>
  surfaceTools(options?: { identity?: AgentIdentity | null }): GovernedTool[]
  explainSurfacing(options?: { identity?: AgentIdentity | null }): SurfacingDecision[]
  groupedTools(options?: { identity?: AgentIdentity | null }): ToolGroupSummary[]
  estimateTokens(options?: { identity?: AgentIdentity | null }): TokenBudgetReport
  /**
   * Register the surfaced tools with `document.modelContext`. `registrations`
   * resolves with each tool's status (callable / failed) once the browser
   * has accepted or rejected it.
   */
  publishToWebMcp(options?: { identity?: AgentIdentity | null }): {
    revoked: boolean
    surfaced: number
    registrations: Promise<WebMcpRegistration[]>
  }
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

/**
 * Lock the SDK to the canonical Agentronics gateway. The only override
 * accepted is a localhost / 127.0.0.1 URL — purely so contributors running
 * `pnpm dev` can hit a local gateway. Any other value (a competing host, a
 * proxy, an MITM target) throws synchronously, before any traces are
 * emitted.
 *
 * The Agentronics SDK is licensed under Apache 2.0 but is designed to
 * operate exclusively against the Agentronics service. Self-hosted /
 * third-party backends are not supported.
 */
const resolveGatewayUrl = (provided: string | undefined): string => {
  if (provided === undefined) return DEFAULT_GATEWAY_URL
  if (provided === DEFAULT_GATEWAY_URL) return provided
  let parsed: URL
  try {
    parsed = new URL(provided)
  } catch {
    throw new Error(
      `Agentronics SDK: \`gatewayUrl\` is not a valid URL: ${provided}`
    )
  }
  if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
    return provided
  }
  throw new Error(
    `Agentronics SDK does not support custom gateway URLs. ` +
      `Omit \`gatewayUrl\` to use the canonical https://gateway.agentronics.dev. ` +
      `The only accepted override is a localhost / 127.0.0.1 URL for local development. ` +
      `Got: ${provided}`
  )
}

export const init = (options: InitOptions): AgentronicsClient => {
  const {
    publishableKey,
    siteId = 'default',
    debug = false,
    policies = [],
    trace = {},
  } = options
  const gatewayUrl = resolveGatewayUrl(options.gatewayUrl)

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
  const toolSync = createToolSync({ gatewayUrl, siteId, publishableKey })

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
  const reviewer: Reviewer | undefined =
    options.review === false
      ? undefined
      : (options.review ?? (typeof document === 'undefined' ? undefined : createReviewPrompt()))
  const tools = createToolRegistry({
    evaluate,
    ...(reviewer ? { reviewer } : {}),
    setPolicies: (rules) => policyEngine.set(rules),
    listPolicies: () => policyEngine.list(),
    onTrace: emitTrace,
    // Every tools.execute() call without an explicit identity gets the
    // current detected/declared/authenticated agent. Button-bound tools
    // become attributable without their handlers having to know about
    // agents.
    identityResolver: () => agentContext.snapshot().identity,
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

  let toolDescriptions: Record<string, string> = { ...(options.toolDescriptions ?? {}) }
  const withDescriptions = (list: GovernedTool[]) =>
    list.map((tool) => {
      const description = toolDescriptions[tool.name]
      return description ? { ...tool, description } : tool
    })
  const surfaceFor = (identity: AgentIdentity | null) =>
    withDescriptions(surfaceTools(tools.list(), surfacingContext(identity)))

  // Names of the last published set; null until the host first publishes.
  let publishedKey: string | null = null
  const keyOf = (list: GovernedTool[]) => list.map((tool) => tool.name).sort().join('\n')
  const republish = (list: GovernedTool[]) => {
    const key = keyOf(list)
    if (key === publishedKey) return null
    publishedKey = key
    return webmcp.publish(list)
  }

  const handleToolInvoked = (toolName: string) => {
    if (!progression) return
    const transition = progression.notify(toolName)
    if (transition.changed && publishedKey !== null) republish(surfaceFor(agentContext.snapshot().identity))
  }

  // Fallback identity used only when no detection has fired yet AND the call
  // arrives through navigator.modelContext — a call through that channel is
  // by definition an agent call, even if the specific vendor wasn't matched.
  const fallbackWebMcpIdentity: AgentIdentity = {
    class: 'webmcp',
    trust: 'detected',
    confidence: 1,
    vendor: null,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    detectionVersion: SDK_VERSION,
    signals: { source: 'navigator.modelContext' },
  }

  const webmcp = createWebMcpAdapter({
    invoke: async (tool, input, signal) => {
      noteWebMcpCall(tool.name)
      const identity = agentContext.snapshot().identity ?? fallbackWebMcpIdentity
      const result = await tools.execute(tool.name, input, identity, signal ? { signal } : {})
      handleToolInvoked(tool.name)
      return result
    },
  })

  // A tool call or `toolactivated` event through document.modelContext is the
  // WebMCP agent announcing itself: attribute the session to it unless a
  // stronger identity (declared / authenticated) is already in place.
  const adoptWebMcpAgent = (toolName: string) => {
    const current = agentContext.snapshot().identity
    if (current && current.trust !== 'detected') return
    if (current?.class === 'webmcp') return
    const identity: AgentIdentity = {
      ...fallbackWebMcpIdentity,
      signals: { source: webmcp.source() ?? 'document', tool: toolName },
    }
    agentContext.set(identity, 'detect')
    emitTrace({ type: 'agent.detected', agent: identity, metadata: { detectedClass: 'webmcp', via: 'webmcp-activity' } })
  }
  const noteWebMcpCall = (toolName: string) => adoptWebMcpAgent(toolName)
  onWebMcpActivity((activity) => {
    if (activity.type === 'activated') adoptWebMcpAgent(activity.toolName)
  })

  // When the ambient identity changes (late WebMCP polyfill, declared
  // identity, successful authenticate()), re-publish the WebMCP surface so
  // any agent currently bound to navigator.modelContext sees the
  // identity-gated tool set rather than the stale anonymous one.
  // Only once the host has published, and only when the identity-gated set
  // actually changed: re-registering aborts the current registrations.
  agentContext.subscribe((snapshot) => {
    if (publishedKey === null || !webmcp.available()) return
    republish(surfaceFor(snapshot.identity))
  })

  const visionOption = options.visionDetection ?? options.autoDetect !== false
  const vision: VisionDetector | null =
    visionOption === false || typeof document === 'undefined'
      ? null
      : createVisionDetector({
          ...(visionOption === true ? {} : visionOption),
          onDetect: (identity) => {
            const current = agentContext.snapshot().identity
            // Never replace a declared/verified identity or a WebMCP agent with a heuristic.
            if (current && (current.trust !== 'detected' || current.class === 'webmcp')) return
            agentContext.set(identity, 'detect')
            emitTrace({ type: 'agent.detected', agent: identity, metadata: { detectedClass: 'screenshot', via: 'vision-behaviour' } })
          },
        })

  // Kick off the initial detection cycle if the host opted in. Default is
  // on so /traces is populated with class/trust/signals without the host
  // page having to call detect() manually before each interaction.
  const autoDetectOption = options.autoDetect ?? true
  const ready: Promise<AgentIdentity | null> = autoDetectOption === false
    ? Promise.resolve(null)
    : (async () => {
        const detectOpts: DetectAgentOptions =
          autoDetectOption === true ? {} : autoDetectOption
        try {
          return await detect(detectOpts)
        } catch (err) {
          // Detection problems shouldn't crash the host's init() — log when
          // debug is on, otherwise swallow and treat as "human or
          // undetectable agent."
          if (debug) console.warn('[agentronics] autoDetect failed:', err)
          return null
        }
      })()

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
    vision,
    ready,
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
    setToolDescriptions: (descriptions: Record<string, string>) => {
      toolDescriptions = { ...descriptions }
      if (publishedKey !== null) {
        publishedKey = null // descriptions changed: re-register even if the names didn't
        republish(surfaceFor(agentContext.snapshot().identity))
      }
    },
    syncTools: async () => {
      const all = tools.list({ includeDisabled: true })
      const count = await toolSync.push(all)
      emitTrace({ type: 'tool.registered', metadata: { operation: 'sync', count } })
      return count
    },
    surfaceTools: ({ identity = null }: { identity?: AgentIdentity | null } = {}) => surfaceFor(identity),
    explainSurfacing: ({ identity = null }: { identity?: AgentIdentity | null } = {}) =>
      explainSurfacing(tools.list(), surfacingContext(identity)),
    groupedTools: ({ identity = null }: { identity?: AgentIdentity | null } = {}) => groupTools(surfaceFor(identity)),
    estimateTokens: ({ identity = null }: { identity?: AgentIdentity | null } = {}) => estimateBudget(surfaceFor(identity)),
    publishToWebMcp: ({ identity = null }: { identity?: AgentIdentity | null } = {}) => {
      const surfaced = surfaceFor(identity)
      publishedKey = keyOf(surfaced)
      const result = webmcp.publish(surfaced)
      const registrations = result.registrations.then((list) => {
        list.forEach((r) => {
          emitTrace({
            type: 'tool.surfaced',
            tool: r.name,
            outcome: r.status === 'callable' ? 'success' : 'error',
            ...(r.error ? { error: r.error } : {}),
            metadata: { state: r.status === 'callable' ? 'published' : 'failed', source: webmcp.source(), trust: identity?.trust ?? null },
          })
        })
        return list
      })
      return { revoked: result.revoked, surfaced: surfaced.length, registrations }
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
