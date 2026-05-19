import { describe, expect, it, vi } from 'vitest'
import { spiffe } from './spiffe.js'

describe('spiffe auth method', () => {
  it('returns null when no spiffeJwt is present', async () => {
    const identity = await spiffe().authenticate({}, {})
    expect(identity).toBeNull()
  })

  it('produces a verified identity with default vendor when no verifier is wired', async () => {
    const identity = await spiffe().authenticate({ spiffeJwt: 'eyJ.spiffe' }, {})
    expect(identity?.trust).toBe('verified')
    expect(identity?.vendor).toBe('spiffe')
    expect(identity?.class).toBe('webmcp')
    expect(identity?.signals.spiffe).toBe(true)
  })

  it('lifts SPIFFE ID into signals.spiffeId from verifier subject', async () => {
    const verifyToken = vi.fn(async () => ({
      trust: 'verified' as const,
      vendor: 'prod.acme.example',
      validUntil: new Date(Date.now() + 60_000).toISOString(),
      subject: 'spiffe://prod.acme.example/payments/web-fe',
      protocol: 'spiffe' as const,
    }))
    const identity = await spiffe().authenticate(
      { spiffeJwt: 'eyJ.spiffe' },
      { verifyToken }
    )
    expect(identity?.signals.spiffeId).toBe('spiffe://prod.acme.example/payments/web-fe')
    expect(identity?.signals.subject).toBe('spiffe://prod.acme.example/payments/web-fe')
    expect(identity?.signals.googleAgent).toBeUndefined()
  })

  it('flags Google enrichment when verifier vendor is google', async () => {
    const verifyToken = vi.fn(async () => ({
      trust: 'verified' as const,
      vendor: 'google',
      validUntil: new Date(Date.now() + 60_000).toISOString(),
      subject: 'spiffe://acme-prod.svc.id.goog/resources/vertex/agent-42',
      protocol: 'google-agent' as const,
      signals: { agent_id: 'agent-42', agent_owner: 'tenant-acme' },
    }))
    const identity = await spiffe().authenticate(
      { spiffeJwt: 'eyJ.spiffe' },
      { verifyToken }
    )
    expect(identity?.vendor).toBe('google')
    expect(identity?.signals.googleAgent).toBe(true)
    expect(identity?.signals.agent_id).toBe('agent-42')
  })
})
