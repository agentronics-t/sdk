import { describe, expect, it, vi } from 'vitest'
import type { AgentIdentity } from '@agentronics/protocol'
import { createAuthEngine } from './engine.js'
import { deriveTrustLevel, highestTrust } from './trustLevel.js'

const detected = (overrides: Partial<AgentIdentity> = {}): AgentIdentity => ({
  class: 'dom',
  trust: 'detected',
  confidence: 0.7,
  vendor: null,
  userAgent: null,
  detectionVersion: '2026.04',
  signals: { webdriver: true },
  ...overrides,
})

describe('trust level helpers', () => {
  it('derives the strongest supplied trust level', () => {
    expect(deriveTrustLevel({ detected: true })).toBe('detected')
    expect(deriveTrustLevel({ detected: true, declared: true })).toBe('declared')
    expect(deriveTrustLevel({ verified: true })).toBe('verified')
    expect(deriveTrustLevel({ linked: true, verified: true })).toBe('linked')
  })

  it('selects the highest-trust identity', () => {
    const best = highestTrust([detected(), detected({ trust: 'verified', vendor: 'agent' })])
    expect(best?.trust).toBe('verified')
    expect(best?.vendor).toBe('agent')
  })
})

describe('auth engine', () => {
  it('keeps detected identity as the fallback auth method', async () => {
    const engine = createAuthEngine()
    const identity = await engine.authenticate({ detected: detected() })
    expect(identity?.trust).toBe('detected')
    expect(identity?.class).toBe('dom')
  })

  it('accepts self-declared identity claims', async () => {
    const engine = createAuthEngine()
    const identity = await engine.authenticate({
      declaration: { class: 'screenshot', vendor: 'browser-use', token: 'tok_abcdef12' },
    })
    expect(identity?.trust).toBe('declared')
    expect(identity?.vendor).toBe('browser-use')
  })

  it('authenticates bearer tokens', async () => {
    const engine = createAuthEngine()
    const identity = await engine.authenticate({ bearerToken: 'bearer_abcdef12' })
    expect(identity?.trust).toBe('verified')
    expect(identity?.signals.bearer).toBe(true)
  })

  it('authenticates x-agent headers', async () => {
    const engine = createAuthEngine()
    const identity = await engine.authenticate({ xAgentHeader: 'claude;webmcp;sig_123' })
    expect(identity?.trust).toBe('verified')
    expect(identity?.class).toBe('webmcp')
    expect(identity?.vendor).toBe('claude')
  })

  it('authenticates extension tokens with remote verification override', async () => {
    const verifyToken = vi.fn(async () => ({
      trust: 'linked' as const,
      vendor: 'operator',
      validUntil: new Date(Date.now() + 60_000).toISOString(),
    }))
    const engine = createAuthEngine({ context: { verifyToken } })
    const identity = await engine.authenticate({ extensionToken: 'ext_abcdef12' })
    expect(identity?.trust).toBe('linked')
    expect(identity?.vendor).toBe('operator')
    expect(verifyToken).toHaveBeenCalledWith('extensionToken', 'ext_abcdef12')
  })

  it('authenticates session-link tokens as linked when a user id is present', async () => {
    const engine = createAuthEngine()
    const identity = await engine.authenticate({
      sessionLinkToken: 'ses_abcdef12',
      linkedUserId: 'user_123',
    })
    expect(identity?.trust).toBe('linked')
    expect(identity?.signals.linkedUserId).toBe('user_123')
  })

  it('authenticates oauth2 tokens', async () => {
    const engine = createAuthEngine()
    const identity = await engine.authenticate({
      oauth2AccessToken: 'oauth_abcdef12',
      oauth2Subject: 'user_123',
      vendorHint: 'google',
    })
    expect(identity?.trust).toBe('linked')
    expect(identity?.vendor).toBe('google')
  })

  it('emits an auth trace', async () => {
    const onTrace = vi.fn()
    const engine = createAuthEngine({ onTrace })
    await engine.authenticate({ bearerToken: 'bearer_abcdef12' })
    expect(onTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'auth.identity_presented',
        outcome: 'success',
      })
    )
  })
})
