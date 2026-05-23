import { describe, expect, it, vi } from 'vitest'
import type { AgentIdentity } from '@agentronics/protocol'
import { createToolRegistry } from './registry.js'

const webmcpIdentity = (overrides: Partial<AgentIdentity> = {}): AgentIdentity => ({
  class: 'webmcp',
  trust: 'detected',
  confidence: 1,
  vendor: null,
  userAgent: null,
  detectionVersion: '2026.04',
  signals: {},
  ...overrides,
})

describe('tool registry', () => {
  it('adds authz policies from registered tools and executes allowed tools', async () => {
    const policies: unknown[] = []
    const registry = createToolRegistry({
      evaluate: async () => ({ decision: 'allow', ruleId: 'tool:cart.add', reason: 'ok' }),
      setPolicies: (next) => {
        policies.splice(0, policies.length, ...next)
      },
      listPolicies: () => [],
    })

    registry.register({
      name: 'cart.add',
      authz: { minTrust: 'declared', allowedClasses: [], decision: 'allow' },
      execute: (input) => ({ quantity: (input as { quantity: number }).quantity }),
    })

    expect(policies).toHaveLength(1)
    await expect(registry.execute('cart.add', { quantity: 2 })).resolves.toEqual({ quantity: 2 })
  })

  it('blocks denied tool executions and emits a trace', async () => {
    const onTrace = vi.fn()
    const registry = createToolRegistry({
      evaluate: async () => ({ decision: 'deny', ruleId: 'deny', reason: 'blocked' }),
      onTrace,
    })
    registry.register({ name: 'cart.checkout', execute: () => ({ ok: true }) })

    await expect(registry.execute('cart.checkout', {})).rejects.toThrow(/blocked/)
    expect(onTrace).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tool.executed', outcome: 'blocked' })
    )
  })

  it('traces a successful execution with a duration', async () => {
    const onTrace = vi.fn()
    const registry = createToolRegistry({
      evaluate: async () => ({ decision: 'allow', ruleId: 'tool:ping', reason: 'ok' }),
      onTrace,
    })
    registry.register({ name: 'ping', execute: () => ({ ok: true }) })

    await registry.execute('ping', {})
    const trace = onTrace.mock.calls
      .map((call) => call[0])
      .find((input) => input.type === 'tool.executed')
    expect(trace).toMatchObject({ outcome: 'success' })
    expect(typeof trace.durationMs).toBe('number')
  })

  it('traces a throwing execution as an error and re-throws', async () => {
    const onTrace = vi.fn()
    const registry = createToolRegistry({
      evaluate: async () => ({ decision: 'allow', ruleId: 'tool:boom', reason: 'ok' }),
      onTrace,
    })
    registry.register({
      name: 'boom',
      execute: () => {
        throw new Error('tool failed')
      },
    })

    await expect(registry.execute('boom', {})).rejects.toThrow(/tool failed/)
    expect(onTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool.executed',
        outcome: 'error',
        error: 'tool failed',
      })
    )
  })

  it('uses identityResolver when execute() is called without an identity', async () => {
    const onTrace = vi.fn()
    const identity = webmcpIdentity({ vendor: 'anthropic' })
    const evaluate = vi.fn(async () => ({ decision: 'allow' as const, ruleId: 'tool:ping', reason: 'ok' }))
    const registry = createToolRegistry({
      evaluate,
      onTrace,
      identityResolver: () => identity,
    })
    registry.register({ name: 'ping', execute: () => ({ ok: true }) })

    await registry.execute('ping', {})

    // The policy evaluator and the tool itself both saw the resolved identity.
    expect(evaluate).toHaveBeenCalledWith('ping', { identity })
    expect(onTrace).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tool.executed', agent: identity })
    )
  })

  it('respects an explicit null identity as anonymous (overrides the resolver)', async () => {
    const onTrace = vi.fn()
    const identity = webmcpIdentity({ vendor: 'anthropic' })
    const registry = createToolRegistry({
      evaluate: async () => ({ decision: 'allow', ruleId: 'tool:ping', reason: 'ok' }),
      onTrace,
      identityResolver: () => identity,
    })
    registry.register({ name: 'ping', execute: () => ({ ok: true }) })

    await registry.execute('ping', {}, null)

    const trace = onTrace.mock.calls
      .map((call) => call[0])
      .find((input) => input.type === 'tool.executed')
    expect(trace?.agent).toBeNull()
  })

  it('respects an explicit identity argument over the resolver', async () => {
    const onTrace = vi.fn()
    const resolverIdentity = webmcpIdentity({ vendor: 'resolver' })
    const explicitIdentity = webmcpIdentity({ class: 'dom', vendor: 'playwright' })
    const registry = createToolRegistry({
      evaluate: async () => ({ decision: 'allow', ruleId: 'tool:ping', reason: 'ok' }),
      onTrace,
      identityResolver: () => resolverIdentity,
    })
    registry.register({ name: 'ping', execute: () => ({ ok: true }) })

    await registry.execute('ping', {}, explicitIdentity)

    expect(onTrace).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tool.executed', agent: explicitIdentity })
    )
  })
})
