import { describe, expect, it, vi } from 'vitest'
import type { AgentIdentity } from '@agentronics/protocol'
import { createAuthEngine, defaultAuthMethods, previewAuthMethods } from './engine.js'
import { deriveTrustLevel, highestTrust } from './trustLevel.js'

const detected = (overrides: Partial<AgentIdentity> = {}): AgentIdentity => ({
  class: 'dom',
  trust: 'detected',
  confidence: 0.7,
  vendor: null,
  userAgent: null,
  detectionVersion: '0.1.2',
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

  it('an unchecked bearer token is only a claim (declared)', async () => {
    const engine = createAuthEngine()
    const identity = await engine.authenticate({ bearerToken: 'bearer_abcdef12' })
    expect(identity?.trust).toBe('declared')
    expect(identity?.signals.bearer).toBe(true)
  })

  it('reads x-agent headers as a claim (the proof is not checked client-side)', async () => {
    const engine = createAuthEngine()
    const identity = await engine.authenticate({ xAgentHeader: 'claude;webmcp;sig_123' })
    expect(identity?.trust).toBe('declared')
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

  it('links a session only after a verifier accepts the session-link token', async () => {
    const unchecked = await createAuthEngine().authenticate({ sessionLinkToken: 'ses_abcdef12', linkedUserId: 'user_123' })
    expect(unchecked?.trust).toBe('declared')
    const verifyToken = vi.fn(async () => ({ trust: 'verified' as const, vendor: 'site', validUntil: new Date(Date.now() + 60_000).toISOString() }))
    const engine = createAuthEngine({ context: { verifyToken } })
    const identity = await engine.authenticate({
      sessionLinkToken: 'ses_abcdef12',
      linkedUserId: 'user_123',
    })
    expect(identity?.trust).toBe('linked')
    expect(identity?.signals.linkedUserId).toBe('user_123')
  })

  it('links an oauth2 user only after the token is verified', async () => {
    const unchecked = await createAuthEngine().authenticate({ oauth2AccessToken: 'oauth_abcdef12', oauth2Subject: 'user_123' })
    expect(unchecked?.trust).toBe('declared')
    const verifyToken = vi.fn(async () => ({ trust: 'verified' as const, vendor: 'google', validUntil: new Date(Date.now() + 60_000).toISOString() }))
    const engine = createAuthEngine({ context: { verifyToken } })
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

  it('includes protocol + subject in trace metadata for the winning method', async () => {
    const onTrace = vi.fn()
    const verifyToken = vi.fn(async () => ({
      trust: 'verified' as const,
      vendor: 'okta.com',
      validUntil: new Date(Date.now() + 60_000).toISOString(),
      subject: 'auth0|user-42',
      protocol: 'sso' as const,
    }))
    const engine = createAuthEngine({ methods: [...defaultAuthMethods(), ...previewAuthMethods()], context: { verifyToken }, onTrace })
    await engine.authenticate({ ssoIdToken: 'eyJ.abc.def' })
    expect(onTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          protocol: 'sso',
          subject: 'auth0|user-42',
        }),
      })
    )
  })

  it('relabels spiffe trace as google-agent when the verifier flags google vendor', async () => {
    const onTrace = vi.fn()
    const verifyToken = vi.fn(async () => ({
      trust: 'verified' as const,
      vendor: 'google',
      validUntil: new Date(Date.now() + 60_000).toISOString(),
      subject: 'spiffe://acme-prod.svc.id.goog/resources/vertex/agent-42',
      protocol: 'google-agent' as const,
    }))
    const engine = createAuthEngine({ methods: previewAuthMethods(), context: { verifyToken }, onTrace })
    await engine.authenticate({ spiffeJwt: 'eyJ.spiffe' })
    expect(onTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ protocol: 'google-agent' }),
      })
    )
  })

  it('keeps spiffe protocol label when vendor is not google', async () => {
    const onTrace = vi.fn()
    const verifyToken = vi.fn(async () => ({
      trust: 'verified' as const,
      vendor: 'prod.acme.example',
      validUntil: new Date(Date.now() + 60_000).toISOString(),
      subject: 'spiffe://prod.acme.example/payments/web-fe',
      protocol: 'spiffe' as const,
    }))
    const engine = createAuthEngine({ methods: previewAuthMethods(), context: { verifyToken }, onTrace })
    await engine.authenticate({ spiffeJwt: 'eyJ.spiffe' })
    expect(onTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ protocol: 'spiffe' }),
      })
    )
  })

  it('keeps SSO, SPIFFE and mTLS off by default (coming later)', () => {
    const names = createAuthEngine().methods()
    expect(names).not.toContain('sso')
    expect(names).not.toContain('spiffe')
    expect(names).not.toContain('mtls')
    expect(previewAuthMethods().map((m) => m.name)).toEqual(['sso', 'spiffe', 'mtls'])
  })
})
