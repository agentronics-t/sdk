import { beforeAll, describe, expect, it } from 'vitest'
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose'
import { verifyOidcIdToken } from './sso.js'
import type { SsoConfig } from '../../storage/types.js'

interface TestKeys {
  privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey']
  jwksGetKey: ReturnType<typeof createLocalJWKSet>
}

let keys: TestKeys

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  const publicJwk = await exportJWK(publicKey)
  const jwksGetKey = createLocalJWKSet({
    keys: [{ ...publicJwk, kid: 'test-key', alg: 'RS256' }],
  })
  keys = { privateKey, jwksGetKey }
})

const mintOidcToken = async (claims: {
  iss: string
  aud: string | string[]
  sub: string
  expSeconds?: number
}) =>
  new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(claims.iss)
    .setAudience(claims.aud)
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(claims.expSeconds ? `${claims.expSeconds}s` : '1h')
    .sign(keys.privateKey)

const config: SsoConfig = {
  issuer: 'https://acme.okta.com',
  audiences: ['agentronics:site-a'],
}

describe('verifyOidcIdToken', () => {
  it('accepts a token whose iss + aud match the site config', async () => {
    const token = await mintOidcToken({
      iss: config.issuer,
      aud: config.audiences[0]!,
      sub: 'auth0|user-42',
    })
    const result = await verifyOidcIdToken(token, config, { jwks: keys.jwksGetKey })
    expect(result.trust).toBe('verified')
    expect(result.protocol).toBe('sso')
    expect(result.vendor).toBe('acme.okta.com')
    expect(result.subject).toBe('auth0|user-42')
  })

  it('accepts when token aud is an array containing one allowed audience', async () => {
    const token = await mintOidcToken({
      iss: config.issuer,
      aud: ['other', 'agentronics:site-a'],
      sub: 'auth0|user-42',
    })
    const result = await verifyOidcIdToken(token, config, { jwks: keys.jwksGetKey })
    expect(result.trust).toBe('verified')
  })

  it('rejects when issuer mismatches', async () => {
    const token = await mintOidcToken({
      iss: 'https://attacker.example.com',
      aud: config.audiences[0]!,
      sub: 'auth0|user-42',
    })
    await expect(
      verifyOidcIdToken(token, config, { jwks: keys.jwksGetKey })
    ).rejects.toThrow()
  })

  it('rejects when audience does not match the allowlist', async () => {
    const token = await mintOidcToken({
      iss: config.issuer,
      aud: 'agentronics:site-b',
      sub: 'auth0|user-42',
    })
    await expect(
      verifyOidcIdToken(token, config, { jwks: keys.jwksGetKey })
    ).rejects.toThrow()
  })
})
