import { describe, expect, it, vi } from 'vitest'
import { mtls } from './mtls.js'

describe('mtls auth method', () => {
  it('returns null when no xfccHeader is present', async () => {
    const identity = await mtls().authenticate({}, {})
    expect(identity).toBeNull()
  })

  it('produces a verified identity from raw XFCC when no verifier is wired', async () => {
    const identity = await mtls().authenticate(
      { xfccHeader: 'Subject="CN=agent-42"' },
      {}
    )
    expect(identity?.trust).toBe('verified')
    expect(identity?.vendor).toBe('mtls')
    expect(identity?.class).toBe('webmcp')
    expect(identity?.signals.mtls).toBe(true)
  })

  it('forwards verifier response (subject, vendor, custom signals)', async () => {
    const verifyToken = vi.fn(async () => ({
      trust: 'verified' as const,
      vendor: 'CN=Acme Root CA',
      validUntil: new Date(Date.now() + 60_000).toISOString(),
      subject: 'spiffe://prod.acme.example/payments/web-fe',
      protocol: 'mtls' as const,
      signals: {
        fingerprint: 'ab:cd:ef',
        spiffeId: 'spiffe://prod.acme.example/payments/web-fe',
      },
    }))
    const identity = await mtls().authenticate(
      { xfccHeader: 'By=spiffe://edge/;Hash=ab' },
      { verifyToken }
    )
    expect(identity?.vendor).toBe('CN=Acme Root CA')
    expect(identity?.signals.spiffeId).toBe('spiffe://prod.acme.example/payments/web-fe')
    expect(identity?.signals.fingerprint).toBe('ab:cd:ef')
    expect(verifyToken).toHaveBeenCalledWith('mtls', 'By=spiffe://edge/;Hash=ab')
  })
})
