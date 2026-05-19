import { describe, expect, it, vi } from 'vitest'
import { sso } from './sso.js'

describe('sso auth method', () => {
  it('returns null when no ssoIdToken is present', async () => {
    const identity = await sso().authenticate({}, {})
    expect(identity).toBeNull()
  })

  it('produces a verified identity when token is present and no verifier is configured', async () => {
    const identity = await sso().authenticate({ ssoIdToken: 'eyJ.abc.def' }, {})
    expect(identity?.trust).toBe('verified')
    expect(identity?.vendor).toBe('sso')
    expect(identity?.signals.sso).toBe(true)
  })

  it('applies vendor + subject + signals from the verifier response', async () => {
    const verifyToken = vi.fn(async () => ({
      trust: 'verified' as const,
      vendor: 'okta.com',
      validUntil: new Date(Date.now() + 60_000).toISOString(),
      subject: 'auth0|user-42',
      protocol: 'sso' as const,
      signals: { issuer: 'https://acme.okta.com' },
    }))
    const identity = await sso().authenticate(
      { ssoIdToken: 'eyJ.abc.def' },
      { verifyToken }
    )
    expect(identity?.vendor).toBe('okta.com')
    expect(identity?.signals.subject).toBe('auth0|user-42')
    expect(identity?.signals.issuer).toBe('https://acme.okta.com')
    expect(verifyToken).toHaveBeenCalledWith('sso', 'eyJ.abc.def')
  })
})
