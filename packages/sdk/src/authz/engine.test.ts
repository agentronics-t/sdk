import { describe, expect, it } from 'vitest'
import type { AgentIdentity, PolicyRule } from '@agentronics/protocol'
import { createPolicyEngine } from './engine.js'

const id = (overrides: Partial<AgentIdentity> = {}): AgentIdentity => ({
  class: 'webmcp',
  trust: 'verified',
  confidence: 1,
  vendor: 'claude-extension',
  userAgent: null,
  detectionVersion: '0.1.2',
  signals: {},
  ...overrides,
})

const rule = (overrides: Partial<PolicyRule> = {}): PolicyRule => ({
  id: 'r1',
  tool: 'cart.checkout',
  minTrust: 'verified',
  allowedClasses: [],
  decision: 'allow',
  ...overrides,
})

describe('policy engine', () => {
  it('falls back to review when no rule matches', () => {
    const engine = createPolicyEngine([rule({ tool: 'unrelated' })])
    const result = engine.evaluate({ tool: 'cart.checkout', identity: id() })
    expect(result.decision).toBe('review')
    expect(result.ruleId).toBeNull()
  })

  it('applies an exact-match rule', () => {
    const engine = createPolicyEngine([rule()])
    expect(engine.evaluate({ tool: 'cart.checkout', identity: id() }).decision).toBe('allow')
  })

  it('honors wildcard tool patterns', () => {
    const engine = createPolicyEngine([rule({ tool: 'cart.*', decision: 'review' })])
    expect(engine.evaluate({ tool: 'cart.add', identity: id() }).decision).toBe('review')
  })

  it('matches "*" as a catch-all', () => {
    const engine = createPolicyEngine([rule({ tool: '*', decision: 'deny' })])
    expect(engine.evaluate({ tool: 'anything', identity: id() }).decision).toBe('deny')
  })

  it('denies when trust is below minTrust', () => {
    const engine = createPolicyEngine([rule({ minTrust: 'verified' })])
    const result = engine.evaluate({ tool: 'cart.checkout', identity: id({ trust: 'declared' }) })
    expect(result.decision).toBe('deny')
    expect(result.reason).toMatch(/trust >= verified/)
  })

  it('denies when class is not in allowedClasses', () => {
    const engine = createPolicyEngine([rule({ allowedClasses: ['webmcp'] })])
    const result = engine.evaluate({ tool: 'cart.checkout', identity: id({ class: 'dom' }) })
    expect(result.decision).toBe('deny')
    expect(result.reason).toMatch(/restricts to classes/)
  })

  it('denies when no identity is supplied and rule requires trust', () => {
    const engine = createPolicyEngine([rule()])
    const result = engine.evaluate({ tool: 'cart.checkout', identity: null })
    expect(result.decision).toBe('deny')
  })

  it('first matching rule wins', () => {
    const engine = createPolicyEngine([
      rule({ id: 'first', tool: 'cart.*', decision: 'review' }),
      rule({ id: 'second', tool: 'cart.checkout', decision: 'allow' }),
    ])
    const result = engine.evaluate({ tool: 'cart.checkout', identity: id() })
    expect(result.ruleId).toBe('first')
    expect(result.decision).toBe('review')
  })

  it('set() replaces the rule list', () => {
    const engine = createPolicyEngine([rule({ id: 'r1' })])
    engine.set([rule({ id: 'r2', tool: 'admin.*', decision: 'deny' })])
    expect(engine.list()).toHaveLength(1)
    expect(engine.list()[0]!.id).toBe('r2')
  })

  it('enforces per-rule rate limits', () => {
    const engine = createPolicyEngine([rule({ rateLimit: { max: 1, windowSeconds: 60 } })])
    expect(engine.evaluate({ tool: 'cart.checkout', identity: id() }).decision).toBe('allow')
    const second = engine.evaluate({ tool: 'cart.checkout', identity: id() })
    expect(second.decision).toBe('deny')
    expect(second.reason).toMatch(/rate limit exceeded/)
  })
})
