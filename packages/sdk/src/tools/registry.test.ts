import { describe, expect, it, vi } from 'vitest'
import { createToolRegistry } from './registry.js'

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
})
