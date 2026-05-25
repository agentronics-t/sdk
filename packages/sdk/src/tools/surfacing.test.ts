import { describe, expect, it } from 'vitest'
import type { AgentIdentity } from '@agentronics/protocol'
import { surfaceTools, decideSurfacing, explainSurfacing } from './surfacing.js'
import type { GovernedTool } from './registry.js'

const identity = (overrides: Partial<AgentIdentity> = {}): AgentIdentity => ({
  class: 'webmcp',
  trust: 'detected',
  confidence: 1,
  vendor: 'test',
  userAgent: null,
  detectionVersion: '0.1.2',
  signals: {},
  ...overrides,
})

const toolFactory = (overrides: Partial<GovernedTool>): GovernedTool => ({
  name: overrides.name ?? 'tool',
  execute: () => ({ ok: true }),
  ...overrides,
})

describe('surfaceTools', () => {
  it('hides tools whose minTrust is above the identity', () => {
    const tools = [
      toolFactory({ name: 'public', authz: { minTrust: 'detected', allowedClasses: [], decision: 'allow' } }),
      toolFactory({
        name: 'verified-only',
        authz: { minTrust: 'verified', allowedClasses: [], decision: 'allow' },
      }),
    ]
    const visible = surfaceTools(tools, { identity: identity({ trust: 'declared' }) })
    expect(visible.map((t) => t.name)).toEqual(['public'])
  })

  it('hides tools whose allowedClasses excludes the identity', () => {
    const tools = [
      toolFactory({
        name: 'webmcp-only',
        authz: { minTrust: 'detected', allowedClasses: ['webmcp'], decision: 'allow' },
      }),
    ]
    expect(
      surfaceTools(tools, { identity: identity({ class: 'screenshot' }) })
    ).toHaveLength(0)
  })

  it('honors stage-locked tools and unlocks them once enabled', () => {
    const tools = [
      toolFactory({ name: 'cart.add', stage: 'browse' }),
      toolFactory({ name: 'cart.checkout', stage: 'checkout' }),
    ]
    expect(
      surfaceTools(tools, { identity: identity(), stage: 'browse' }).map((t) => t.name)
    ).toEqual(['cart.add'])
    expect(
      surfaceTools(tools, {
        identity: identity(),
        stage: 'browse',
        enabledStages: ['browse', 'checkout'],
      }).map((t) => t.name)
    ).toEqual(['cart.add', 'cart.checkout'])
  })

  it('hides tools whose authz decision is deny', () => {
    const tool = toolFactory({
      name: 'blocked',
      authz: { minTrust: 'detected', allowedClasses: [], decision: 'deny' },
    })
    expect(decideSurfacing(tool, { identity: identity() })).toMatchObject({
      visible: false,
      reason: 'authz-deny',
    })
  })

  it('reproduces the spec scenario (14 registered, 4 surfaced for detected)', () => {
    const trusted = (name: string, minTrust: 'detected' | 'declared' | 'verified') =>
      toolFactory({ name, authz: { minTrust, allowedClasses: [], decision: 'allow' } })
    const tools = [
      trusted('catalog.search', 'detected'),
      trusted('catalog.read', 'detected'),
      trusted('reviews.read', 'detected'),
      trusted('shipping.estimate', 'detected'),
      trusted('cart.add', 'declared'),
      trusted('cart.update', 'declared'),
      trusted('cart.remove', 'declared'),
      trusted('cart.checkout', 'verified'),
      trusted('orders.list', 'verified'),
      trusted('orders.cancel', 'verified'),
      trusted('payments.charge', 'verified'),
      trusted('account.update', 'verified'),
      trusted('returns.start', 'verified'),
      trusted('refunds.issue', 'verified'),
    ]
    const surfaced = surfaceTools(tools, { identity: identity({ trust: 'detected' }) })
    expect(surfaced).toHaveLength(4)
    expect(surfaced.map((t) => t.name)).toEqual([
      'catalog.search',
      'catalog.read',
      'reviews.read',
      'shipping.estimate',
    ])
  })

  it('explainSurfacing returns one decision per tool with reasons', () => {
    const tools = [
      toolFactory({
        name: 'a',
        authz: { minTrust: 'verified', allowedClasses: [], decision: 'allow' },
      }),
      toolFactory({ name: 'b' }),
    ]
    const decisions = explainSurfacing(tools, { identity: identity({ trust: 'declared' }) })
    expect(decisions).toHaveLength(2)
    expect(decisions[0]?.visible).toBe(false)
    expect(decisions[1]?.visible).toBe(true)
  })
})
