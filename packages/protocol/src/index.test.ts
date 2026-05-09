import { describe, expect, it } from 'vitest'
import {
  AgentClass,
  AgentIdentity,
  PUBLISHABLE_KEY_PREFIX,
  PublishableApiKey,
  SECRET_KEY_PREFIX,
  SecretApiKey,
  TraceBatch,
  TraceEvent,
  TraceEventType,
  TrustLevel,
  classifyApiKey,
} from './index.js'

/**
 * Public-surface smoke test for `@agentronics/protocol`. The package is pure
 * Zod schemas + helpers, so the meaningful coverage is "every exported schema
 * accepts a representative happy-path payload and rejects an obvious bad
 * one". If this file ever drops to zero assertions, the package effectively
 * has no test suite.
 */
describe('@agentronics/protocol public surface', () => {
  it('AgentClass + TrustLevel enums round-trip', () => {
    expect(AgentClass.parse('webmcp')).toBe('webmcp')
    expect(() => AgentClass.parse('rover')).toThrow()
    expect(TrustLevel.parse('verified')).toBe('verified')
    expect(() => TrustLevel.parse('superuser')).toThrow()
  })

  it('AgentIdentity fills in defaults and validates ranges', () => {
    const parsed = AgentIdentity.parse({
      class: 'webmcp',
      trust: 'detected',
      vendor: null,
      userAgent: null,
    })
    expect(parsed.confidence).toBe(1)
    expect(parsed.detectionVersion).toBe('2026.04')
    expect(parsed.signals).toEqual({})

    expect(() =>
      AgentIdentity.parse({
        class: 'dom',
        trust: 'detected',
        confidence: 1.5, // out of range
        vendor: null,
        userAgent: null,
      })
    ).toThrow()
  })

  it('classifyApiKey + key prefix schemas agree', () => {
    const pk = `${PUBLISHABLE_KEY_PREFIX}abcdef12`
    const sk = `${SECRET_KEY_PREFIX}abcdef12`
    expect(classifyApiKey(pk)).toBe('publishable')
    expect(classifyApiKey(sk)).toBe('secret')
    expect(classifyApiKey('nope_abcdef12')).toBe('unknown')

    expect(PublishableApiKey.parse(pk)).toBe(pk)
    expect(SecretApiKey.parse(sk)).toBe(sk)
    expect(() => PublishableApiKey.parse(sk)).toThrow()
    expect(() => SecretApiKey.parse(pk)).toThrow()
  })

  it('TraceEvent + TraceBatch parse a realistic batch', () => {
    const event = TraceEvent.parse({
      id: 'trc_smoke',
      siteId: 'demo-site',
      sessionId: 'ses_smoke',
      occurredAt: new Date().toISOString(),
      type: TraceEventType.parse('tool.executed'),
      outcome: 'success',
      metadata: { source: 'protocol-smoke-test' },
    })
    const batch = TraceBatch.parse({
      publishableKey: `${PUBLISHABLE_KEY_PREFIX}smoke123`,
      events: [event],
    })
    expect(batch.events).toHaveLength(1)
    expect(batch.events[0]?.type).toBe('tool.executed')
  })

  it('TraceBatch rejects empty event arrays', () => {
    expect(() =>
      TraceBatch.parse({
        publishableKey: `${PUBLISHABLE_KEY_PREFIX}smoke123`,
        events: [],
      })
    ).toThrow()
  })
})
