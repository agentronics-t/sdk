import type { AgentIdentity, PolicyEvaluation, PolicyRule } from '@agentronics/protocol'
import type { TraceInput } from '../observability/tracer.js'

export interface GovernedTool<Input = unknown, Output = unknown> {
  name: string
  version?: string
  group?: string
  description?: string
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  stage?: string
  authz?: Omit<PolicyRule, 'id' | 'tool'>
  rateLimit?: PolicyRule['rateLimit']
  execute: (input: Input, context: { identity: AgentIdentity | null }) => Promise<Output> | Output
}

export interface ToolRegistryOptions {
  evaluate: (tool: string, options?: { identity?: AgentIdentity | null }) => Promise<PolicyEvaluation>
  setPolicies?: (rules: PolicyRule[]) => void
  listPolicies?: () => PolicyRule[]
  onTrace?: (input: TraceInput) => void
  /**
   * Resolves the ambient agent identity for `execute()` calls that don't pass
   * one explicitly. The SDK wires this to the agentContext snapshot so a
   * button-bound tool fires with the detected agent attached — without
   * forcing every consumer to thread identity through their click handlers.
   *
   * Semantics:
   * - `execute(name, input)` or `execute(name, input, undefined)` → resolver
   * - `execute(name, input, null)` → respected (caller wants anonymous attribution)
   * - `execute(name, input, identity)` → respected
   */
  identityResolver?: () => AgentIdentity | null
}

export interface ToolRegistry {
  register(tool: GovernedTool): () => void
  unregister(name: string): void
  enable(name: string): void
  disable(name: string): void
  isEnabled(name: string): boolean
  list(options?: { includeDisabled?: boolean }): GovernedTool[]
  get(name: string): GovernedTool | undefined
  execute<Input, Output>(
    name: string,
    input: Input,
    identity?: AgentIdentity | null
  ): Promise<Output>
}

export const createToolRegistry = ({
  evaluate,
  setPolicies,
  listPolicies,
  onTrace,
  identityResolver,
}: ToolRegistryOptions): ToolRegistry => {
  const tools = new Map<string, GovernedTool>()
  const disabled = new Set<string>()

  const writePolicyFor = (tool: GovernedTool) => {
    if (!tool.authz || !setPolicies || !listPolicies) return
    const rule: PolicyRule = {
      id: `tool:${tool.name}`,
      tool: tool.name,
      ...tool.authz,
      rateLimit: tool.rateLimit ?? tool.authz.rateLimit,
    }
    setPolicies([...listPolicies().filter((item) => item.id !== rule.id), rule])
  }

  return {
    register(tool) {
      tools.set(tool.name, tool)
      disabled.delete(tool.name)
      writePolicyFor(tool)
      onTrace?.({
        type: 'tool.registered',
        tool: tool.name,
        metadata: {
          version: tool.version ?? null,
          group: tool.group ?? null,
          stage: tool.stage ?? null,
        },
      })
      return () => {
        tools.delete(tool.name)
        disabled.delete(tool.name)
      }
    },
    unregister(name) {
      tools.delete(name)
      disabled.delete(name)
    },
    enable(name) {
      if (!tools.has(name) || !disabled.has(name)) return
      disabled.delete(name)
      onTrace?.({
        type: 'tool.surfaced',
        tool: name,
        metadata: { state: 'enabled' },
      })
    },
    disable(name) {
      if (!tools.has(name) || disabled.has(name)) return
      disabled.add(name)
      onTrace?.({
        type: 'tool.surfaced',
        tool: name,
        metadata: { state: 'disabled' },
      })
    },
    isEnabled: (name) => tools.has(name) && !disabled.has(name),
    list({ includeDisabled = false } = {}) {
      const all = [...tools.values()]
      return includeDisabled ? all : all.filter((tool) => !disabled.has(tool.name))
    },
    get: (name) => tools.get(name),
    async execute<Input, Output>(
      name: string,
      input: Input,
      identity?: AgentIdentity | null
    ): Promise<Output> {
      // `undefined` means "use the ambient identity"; explicit `null` means
      // "anonymous". This lets button handlers stay as `tools.execute(name,
      // input)` while still being attributed to whatever detect()/declare()
      // resolved into agentContext.
      const resolvedIdentity =
        identity === undefined ? (identityResolver?.() ?? null) : identity
      const tool = tools.get(name) as GovernedTool<Input, Output> | undefined
      if (!tool) throw new Error(`Tool "${name}" is not registered.`)
      if (disabled.has(name)) {
        const policy: PolicyEvaluation = {
          decision: 'deny',
          ruleId: `tool:${name}`,
          reason: 'Tool is disabled.',
        }
        onTrace?.({ type: 'tool.executed', tool: name, agent: resolvedIdentity, policy, outcome: 'blocked' })
        throw new Error(policy.reason)
      }
      const policy = await evaluate(name, { identity: resolvedIdentity })
      if (policy.decision === 'deny') {
        onTrace?.({ type: 'tool.executed', tool: name, agent: resolvedIdentity, policy, outcome: 'blocked' })
        throw new Error(policy.reason)
      }
      // Time the execution and trace the outcome either way — a tool that
      // throws is still something the agent did, and the observability /
      // analytics surfaces need both the latency and the error.
      const start = Date.now()
      try {
        const output = await tool.execute(input, { identity: resolvedIdentity })
        onTrace?.({
          type: 'tool.executed',
          tool: name,
          agent: resolvedIdentity,
          policy,
          outcome: 'success',
          durationMs: Date.now() - start,
        })
        return output
      } catch (error) {
        onTrace?.({
          type: 'tool.executed',
          tool: name,
          agent: resolvedIdentity,
          policy,
          outcome: 'error',
          durationMs: Date.now() - start,
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  }
}
